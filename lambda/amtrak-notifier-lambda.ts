import { fetchStation, fetchTrain } from "amtrak";
import { StationResponse, StationStatus, TrainResponse } from "amtrak/dist/types";
import { Handler } from 'aws-cdk-lib/aws-lambda';
import { ScheduledEvent } from 'aws-lambda';
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetParameterCommand, ParameterType, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export const checkAmtrakStatus: Handler = async (event: ScheduledEvent) => {
    const train = event.detail['train'];
    const station = event.detail['station'];
    const topicArn = event.detail['topicArn'];

    console.log(`Getting station ${station}...`);
    const response = await fetchStation(station);
    const trainId = await stationHandler(train, station, response);

    if (!trainId) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Could not find train ${train} arriving at ${station} on ${event.time}`,
            }),
        };
    }

    // check to see if already notified today
    if (await hasDepartureNotificationOccurred(trainId, station)) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Already posted to SNS for train ${trainId} today`,
            }),
        };
    } else {
        console.log(`Getting train ${trainId}...`);
        return await fetchTrain(trainId).then(trainHandler.bind(null, train, station, topicArn));
    }
}

/**
 * This function can only get stations in real time, i.e. gets trains arriving the day the code is run.
 * @param train Amtrak train number
 * @param station Three-letter station code
 * @param stations StationResponse
 * @returns The trainId for trainNumber that is arriving at station today
 */
async function stationHandler(train: string, station: string, stations: StationResponse) {
    // get the train ID for the train arriving at the station on the event date
    const trains = stations[station].trains;
    var trainId;
    for (var t of trains) {
        if (t.split('-')[0] === train) {
            trainId = t;
        }
    }
    return trainId;
}

async function trainHandler(trainNumber: string, stationCode: string, topicArn: string, trains: TrainResponse) {
    var train = trains[trainNumber][0];
    const startDate = train.stations[0].schDep;
    for (var s of train.stations) {
        if (s.code === stationCode) {
            if (s.status === StationStatus.Departed) {
                return await sendNotification(trainNumber, startDate, stationCode, s.dep, s.tz, topicArn);
            }
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: `Amtrak Train ${trainNumber} has not departed ${stationCode}`,
        }),
    };
}

/**
 * 
 * @param trainId Amtrak train ID (train-date)
 * @param station Three-letter station code
 * @returns True if the train has already departed the station and the notification has been posted
 */
async function hasDepartureNotificationOccurred(trainId: string, station: string) {
    const train = trainId.split('-')[0];
    const client = new SSMClient();
    const param = `/AmtrakNotifier/${train}/${station}/lastTrain`;
    try {
        const response = await client.send(
            new GetParameterCommand({
                Name: param
            })
        );

        if (response.Parameter !== undefined) {
            const lastTrainDate = response.Parameter.Value;
            if (lastTrainDate !== undefined) {
                if (new Date(lastTrainDate).getDate() === parseInt(trainId.split('-')[1])) {
                    return true;
                }
            }
        }
    } catch {
        console.log(`Could not find ${param}`);
    }
    return false;
}

async function sendNotification(train: string, startDate: string, station: string, depTime: string, timeZone: string, topicArn: string) {
    const dateString = new Date(depTime).toLocaleDateString('en-US', { timeZone: timeZone, dateStyle: 'medium' });
    const timeString = new Date(depTime).toLocaleTimeString('en-US', { timeZone: timeZone, timeZoneName: 'short', hour: 'numeric', minute: 'numeric'});
    const snsClient = new SNSClient();
    const response = await snsClient.send(
        new PublishCommand({
            Message: `Amtrak Train ${train} has departed ${station} at ${timeString} on ${dateString}.`,
            TopicArn: topicArn,
        })
    );

    // save the start date of this train, so we don't notify for this train multiple times
    // if we start getting too much data, might have to move to DynamoDB
    const ssmClient = new SSMClient();
    await ssmClient.send(
        new PutParameterCommand({
            Name: `/AmtrakNotifier/${train}/${station}/lastTrain`,
            Value: startDate,
            Type: ParameterType.STRING,
            Overwrite: true
        })
    );

    return response;
}