import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps, RemovalPolicy, CfnOutput, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ComputeStackProps extends StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  albSg: ec2.SecurityGroup;
  webSg: ec2.SecurityGroup;
  apiSg: ec2.SecurityGroup;
}

export class ComputeStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly webRepo: ecr.Repository;
  public readonly apiRepo: ecr.Repository;
  public readonly apiTaskRole: iam.Role;
  public readonly webTaskRole: iam.Role;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    const { projectName, envName, vpc, albSg, webSg, apiSg } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== ECR (×2) ====
    this.webRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: `${prefix}-web`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    this.apiRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: `${prefix}-api`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // ==== ECS Cluster ====
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${prefix}-cluster`,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ==== Task Roles ====
    this.webTaskRole = new iam.Role(this, 'WebTaskRole', {
      roleName: `${prefix}-ecs-task-role-web`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.apiTaskRole = new iam.Role(this, 'ApiTaskRole', {
      roleName: `${prefix}-ecs-task-role-api`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream',
        'bedrock:Retrieve', 'bedrock:RetrieveAndGenerate',
        'bedrock:ApplyGuardrail',
      ],
      resources: ['*'],
    }));
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['neptune-db:*'],
      resources: [`arn:aws:neptune-db:${this.region}:${this.account}:*/*`],
    }));
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aoss:APIAccessAll'],
      resources: [`arn:aws:aoss:${this.region}:${this.account}:collection/*`],
    }));
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:${prefix}-*`],
    }));

    // ==== Web Task Definition (ARM64, 0.5 vCPU / 1 GB) ====
    const webLogs = new logs.LogGroup(this, 'WebLogs', {
      logGroupName: `/aws/ecs/${prefix}-web`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const webTask = new ecs.FargateTaskDefinition(this, 'WebTask', {
      family: `${prefix}-web`,
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole: this.webTaskRole,
    });
    webTask.addContainer('web', {
      containerName: 'web',
      image: ecs.ContainerImage.fromEcrRepository(this.webRepo, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: webLogs, streamPrefix: 'web' }),
      environment: {
        NEXT_PUBLIC_API_BASE: '/api',
      },
    });

    // ==== API Task Definition (ARM64, 1 vCPU / 2 GB) ====
    const apiLogs = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/aws/ecs/${prefix}-api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      family: `${prefix}-api`,
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole: this.apiTaskRole,
    });
    apiTask.addContainer('api', {
      containerName: 'api',
      image: ecs.ContainerImage.fromEcrRepository(this.apiRepo, 'latest'),
      portMappings: [{ containerPort: 8000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogs, streamPrefix: 'api' }),
      environment: {
        AWS_REGION: this.region,
        NEPTUNE_ENDPOINT: cdk.Fn.sub('https://${Endpoint}:8182', {
          Endpoint: cdk.Fn.importValue(`${prefix}-neptune-endpoint`),
        }),
        // os-endpoint export is "https://<host>" — strip prefix to get bare host
        OPENSEARCH_HOST: cdk.Fn.select(2, cdk.Fn.split('/', cdk.Fn.importValue(`${prefix}-os-endpoint`))),
        BEDROCK_GUARDRAIL_ID: cdk.Fn.importValue(`${prefix}-guardrail-id`),
        AURORA_SECRET_ARN: cdk.Fn.importValue(`${prefix}-aurora-secret-arn`),
      },
    });

    // ==== Services ====
    // Plan 2 Task 18: API image pushed to ECR; desiredCount set to 2.
    // Web service remains at desiredCount=0 until web image is built.
    const webService = new ecs.FargateService(this, 'WebService', {
      serviceName: `${prefix}-web`,
      cluster: this.cluster,
      taskDefinition: webTask,
      desiredCount: 0,
      securityGroups: [webSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });
    const apiService = new ecs.FargateService(this, 'ApiService', {
      serviceName: `${prefix}-api`,
      cluster: this.cluster,
      taskDefinition: apiTask,
      desiredCount: 2,
      securityGroups: [apiSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    // ==== ALB + Listener + Target Groups ====
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `${prefix}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const listener = this.alb.addListener('HttpListener', { port: 80, open: false });

    listener.addTargets('WebTarget', {
      targetGroupName: `${prefix}-tg-web`,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webService],
      healthCheck: { path: '/api/health-web', healthyHttpCodes: '200' },
    });
    listener.addTargets('ApiTarget', {
      targetGroupName: `${prefix}-tg-api`,
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: { path: '/healthz', healthyHttpCodes: '200' },
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'AlbDnsName',  { value: this.alb.loadBalancerDnsName, exportName: `${prefix}-alb-dns` });
    new CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName,     exportName: `${prefix}-cluster-name` });
    new CfnOutput(this, 'WebRepoUri',  { value: this.webRepo.repositoryUri,   exportName: `${prefix}-web-repo-uri` });
    new CfnOutput(this, 'ApiRepoUri',  { value: this.apiRepo.repositoryUri,   exportName: `${prefix}-api-repo-uri` });
  }
}
