import { Stack, StackProps, CfnOutput, Duration, Tags } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends StackProps {
  projectName: string;
  envName: string;
  clusterName: string;
  apiServiceName: string;
  webServiceName: string;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { projectName, envName, clusterName, apiServiceName, webServiceName } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== Custom metric definitions used by API ====
    const ns = 'MfgDemo';
    const searchP95 = new cw.Metric({
      namespace: ns, metricName: 'mfg.search.latency.p95',
      statistic: 'Average', period: Duration.minutes(5),
    });
    const agentFirstToken = new cw.Metric({
      namespace: ns, metricName: 'mfg.agent.first_token_ms',
      statistic: 'Average', period: Duration.minutes(5),
    });
    const guardrailBlocks = new cw.Metric({
      namespace: ns, metricName: 'mfg.guardrails.blocks.count',
      statistic: 'Sum', period: Duration.minutes(5),
    });
    const reranker = new cw.Metric({
      namespace: ns, metricName: 'mfg.reranker.latency',
      statistic: 'Average', period: Duration.minutes(5),
    });

    // ==== Dashboard ====
    new cw.Dashboard(this, 'Dashboard', {
      dashboardName: `${prefix}-demo-health`,
      widgets: [
        [
          new cw.GraphWidget({ title: 'Search p95 latency (target <3s)', left: [searchP95], width: 12, height: 6 }),
          new cw.GraphWidget({ title: 'Agent first token (target <2s)',  left: [agentFirstToken], width: 12, height: 6 }),
        ],
        [
          new cw.GraphWidget({ title: 'Guardrail blocks',  left: [guardrailBlocks], width: 12, height: 6 }),
          new cw.GraphWidget({ title: 'Reranker latency',  left: [reranker], width: 12, height: 6 }),
        ],
        [
          new cw.GraphWidget({
            title: 'API CPU/Mem',
            left: [
              new cw.Metric({ namespace: 'AWS/ECS', metricName: 'CPUUtilization',
                              dimensionsMap: { ClusterName: clusterName, ServiceName: apiServiceName },
                              statistic: 'Average', period: Duration.minutes(1) }),
              new cw.Metric({ namespace: 'AWS/ECS', metricName: 'MemoryUtilization',
                              dimensionsMap: { ClusterName: clusterName, ServiceName: apiServiceName },
                              statistic: 'Average', period: Duration.minutes(1) }),
            ],
            width: 24, height: 6,
          }),
        ],
      ],
    });

    // ==== Alarms (5) ====
    new cw.Alarm(this, 'SearchLatencyAlarm', {
      alarmName: `${prefix}-search-p95-over-3s`,
      metric: searchP95,
      threshold: 3000,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'AgentFirstTokenAlarm', {
      alarmName: `${prefix}-agent-first-token-over-2s`,
      metric: agentFirstToken,
      threshold: 2000,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'ApiCpuAlarm', {
      alarmName: `${prefix}-api-cpu-over-80`,
      metric: new cw.Metric({
        namespace: 'AWS/ECS', metricName: 'CPUUtilization',
        dimensionsMap: { ClusterName: clusterName, ServiceName: apiServiceName },
        statistic: 'Average', period: Duration.minutes(5),
      }),
      threshold: 80, evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'WebUnhealthyAlarm', {
      alarmName: `${prefix}-web-task-count-low`,
      metric: new cw.Metric({
        namespace: 'AWS/ECS', metricName: 'RunningTaskCount',
        dimensionsMap: { ClusterName: clusterName, ServiceName: webServiceName },
        statistic: 'Minimum', period: Duration.minutes(1),
      }),
      threshold: 2, evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'GuardrailSpikeAlarm', {
      alarmName: `${prefix}-guardrail-blocks-spike`,
      metric: guardrailBlocks,
      threshold: 50, evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'DashboardName', { value: `${prefix}-demo-health` });
  }
}
