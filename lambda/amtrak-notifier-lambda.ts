import { env } from 'node:process';
import { fetchTrain } from "amtrak";
import { StationStatus, TrainResponse } from "amtrak/dist/types";
import { Handler } from 'aws-cdk-lib/aws-lambda';
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { ScheduledEvent } from 'aws-lambda';

export const checkAmtrakStatus: Handler = async (event: ScheduledEvent) => {
    const date = new Date(event.time).getDate();
    const train = event.detail['train'];
    const station = event.detail['station'];
    const topicArn = event.detail['topicArn'];

    console.log(`Getting train ${train}-${date}...`);
    return await fetchTrain(`${train}-${date}`).then(trainHandler.bind(null, train, station, topicArn));
}

async function trainHandler(trainNumber: string, stationCode: string, topicArn: string, trains: TrainResponse) {
        console.log(`trains: ${trains}`);
        var train = trains[trainNumber][0];
        console.log(`train: ${train}`);
        for (var s of train.stations) {
            console.log(`s: ${s}`);
            if (s.code === stationCode) {
                if (s.status === StationStatus.Departed) {
                    return await sendNotification(trainNumber, stationCode, s.dep, topicArn);
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

async function sendNotification(trainNumber: string, stationCode:string, depTime: string, topicArn: string) {
    const snsClient = new SNSClient({});
    const response = await snsClient.send(
        new PublishCommand({
          Message: `Amtrak Train ${trainNumber} has departed ${stationCode} at ${depTime}.`,
          TopicArn: topicArn,
        }),
      );
    return response;
}