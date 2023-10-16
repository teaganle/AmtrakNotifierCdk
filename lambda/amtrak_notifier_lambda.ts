import { fetchTrain } from "amtrak";
import { StationStatus, TrainResponse } from "amtrak/dist/types";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const checkAmtrakStatus = async () => {
    fetchTrain('171').then(async (trains: TrainResponse) => {
        var train = trains['171'][0];
        for (var s of train.stations) {
            if (s.code == 'NCR') {
                if (s.status == StationStatus.Departed) {
                    sendNotification();
                }
            }
        }
    });
}

const sendNotification = async () => {
    const snsClient = new SNSClient({});
    const response = await snsClient.send(
        new PublishCommand({
          Message: "shiet",
          TopicArn: "idk",
        }),
      );
}