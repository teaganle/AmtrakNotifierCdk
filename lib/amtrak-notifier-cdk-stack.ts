import * as cdk from 'aws-cdk-lib';
import { Schedule, Rule, RuleTargetInput, EventField } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class AmtrakNotifierCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const topic = new Topic(this, 'train171Topic', {
      displayName: 'Amtrak Departure Notification'
    });

    const trackerFunction = new NodejsFunction(this, 'checkAmtrakStatusLambdaFunction', {
      entry: 'lambda/amtrak-notifier-lambda.ts',
      handler: 'checkAmtrakStatus',
      runtime: Runtime.NODEJS_LATEST
    });

    trackerFunction.addToRolePolicy(new PolicyStatement({
      actions: ['SNS:Publish', 'SSM:GetParameter', 'SSM:PutParameter'],
      resources: ['*'],
    }));

    const scheduleRule = new Rule(this, 'train171Rule', {
      schedule: Schedule.cron(
        {
          minute: "0/5", hour: "19-23", month: "*", weekDay: "Thursday", year: "*"
        }
      )
    });

    scheduleRule.addTarget(new LambdaFunction(trackerFunction, {
      retryAttempts: 2,
      event: RuleTargetInput.fromText(
        `{ "time": "${EventField.time}", "train": "171", "station": "NCR", "topicArn": "${topic.topicArn}" }`
      )
    }));

  }
}
