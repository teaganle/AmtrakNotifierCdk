import { fetchTrain } from "amtrak";
import { StationStatus, TrainResponse } from "amtrak/dist/types";
import { Handler } from 'aws-cdk-lib/aws-lambda';
import { ScheduledEvent } from 'aws-lambda';
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetParameterCommand, ParameterType, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export const checkAmtrakStatus: Handler = async (event: ScheduledEvent) => {
    const dayOfMonth = new Date(event.time).getDate();
    const train = event.detail['train'];
    const station = event.detail['station'];
    const topicArn = event.detail['topicArn'];

    // check the queue to see if already notified today
    if (await hasMessageBeenSentToday(train, dayOfMonth)) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Already posted to SNS for train ${train} today`,
            }),
        };
    } else {
        console.log(`Getting train ${train}-${dayOfMonth}...`);
        return await fetchTrain(`${train}-${dayOfMonth}`).then(trainHandler.bind(null, train, station, topicArn));
    }
}

async function hasMessageBeenSentToday(train: string, date: number) {
    const client = new SSMClient();
    const param = `/AmtrakNotifier/${train}/startDate`;
    try {
        const response = await client.send(
            new GetParameterCommand({
                Name: param
            })
        );

        if (response.Parameter !== undefined) {
            const lastMessageDate = response.Parameter.Value;
            if (lastMessageDate !== undefined) {
                if (new Date(lastMessageDate).getDate() === date) {
                    return true;
                }
            }
        }
    } catch {
        console.log(`Could not find ${param}`);
    }
    return false;
}

async function trainHandler(trainNumber: string, stationCode: string, topicArn: string, trains: TrainResponse) {
    var train = trains[trainNumber][0];
    const startDate = train.stations[0].schDep;
    for (var s of train.stations) {
        if (s.code === stationCode) {
            if (s.status === StationStatus.Departed) {
                return await sendNotification(trainNumber, startDate, stationCode, s.dep, topicArn);
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

async function sendNotification(train: string, startDate: string, stationCode: string, depTime: string, topicArn: string) {
    const snsClient = new SNSClient();
    const response = await snsClient.send(
        new PublishCommand({
            Message: `Amtrak Train ${train} has departed ${stationCode} at ${depTime}.`,
            TopicArn: topicArn,
        })
    );

    const ssmClient = new SSMClient();
    await ssmClient.send(
        new PutParameterCommand({
            Name: `/AmtrakNotifier/${train}/startDate`,
            Value: startDate,
            Type: ParameterType.STRING,
            Overwrite: true
        })
    );

    return response;
}