import * as cdk from 'aws-cdk-lib';
import { Schedule, Rule } from 'aws-cdk-lib/aws-events';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class AmtrakNotifierCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AmtrakNotifierCdkQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    // TODO: create SNS topic
    const topic = new Topic(this, 'topic', {
      displayName: 'cool name',
    })
  
    // TODO: create lambda
    const trackerFunction = new Function(this, 'function', {
      code: Code.fromAsset('lambda'),
      handler: 'checkAmtrakStatus',
      runtime: Runtime.NODEJS_LATEST
    })

    // TODO: create eventbridge thingy
    const scheduleRule = new Rule(this, 'Schedule Rule for Amtrak train 171', {
      schedule: Schedule.cron(
        {
          minute: "/5", hour: "15-20", weekDay: "4"
        }
      )
    });

  }
}
