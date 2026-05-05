#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack }       from '../lib/network-stack';
import { DataStack }          from '../lib/data-stack';
import { AIStack }            from '../lib/ai-stack';
import { ComputeStack }       from '../lib/compute-stack';
import { EdgeStack }          from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'ontology-mfg';
const envName     = app.node.tryGetContext('envName') ?? 'dev';
const retailVpcExportName = app.node.tryGetContext('retailVpcExportName')
  ?? 'ontology-retail-dev-vpc-id';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region: 'ap-northeast-2' };
const envUsEast = { account, region: 'us-east-1' };
const prefix = `${projectName}-${envName}`;

// Optional subnet ID overrides for synth-time VPC stub (non-lookup VPCs require explicit
// subnet IDs for constructs that enumerate subnets, e.g. Aurora DatabaseCluster).
// Pass via: --context privateSubnetIds=subnet-a,subnet-b,subnet-c
const privateSubnetIdsCtx: string | undefined = app.node.tryGetContext('privateSubnetIds');
const publicSubnetIdsCtx:  string | undefined = app.node.tryGetContext('publicSubnetIds');
const privateSubnetIds = privateSubnetIdsCtx ? privateSubnetIdsCtx.split(',') : undefined;
const publicSubnetIds  = publicSubnetIdsCtx  ? publicSubnetIdsCtx.split(',')  : undefined;

const network = new NetworkStack(app, `${prefix}-network`, {
  env, crossRegionReferences: true,
  projectName, envName, retailVpcExportName,
  ...(privateSubnetIds ? { privateSubnetIds } : {}),
  ...(publicSubnetIds  ? { publicSubnetIds  } : {}),
});

const data = new DataStack(app, `${prefix}-data`, {
  env, crossRegionReferences: true,
  projectName, envName,
  vpc: network.vpc,
  neptuneSg: network.neptuneSg,
  auroraSg: network.auroraSg,
});
data.addDependency(network);

const ai = new AIStack(app, `${prefix}-ai`, {
  env, crossRegionReferences: true,
  projectName, envName,
  rawDocsBucketArn: data.buckets.rawDocs.bucketArn,
  osCollectionArn: cdk.Fn.importValue(`${prefix}-os-collection-arn`),
});
ai.addDependency(data);

const compute = new ComputeStack(app, `${prefix}-compute`, {
  env, crossRegionReferences: true,
  projectName, envName,
  vpc: network.vpc,
  albSg: network.albSg, webSg: network.webSg, apiSg: network.apiSg,
});
compute.addDependency(network);
compute.addDependency(data);

const edge = new EdgeStack(app, `${prefix}-edge`, {
  env: envUsEast, crossRegionReferences: true,
  projectName, envName,
  albDnsName: cdk.Fn.importValue(`${prefix}-alb-dns`),
  domainName: 'mfg-ontology.whchoi.net',
  hostedZoneName: 'whchoi.net',
});
edge.addDependency(compute);

const obs = new ObservabilityStack(app, `${prefix}-observability`, {
  env, crossRegionReferences: true,
  projectName, envName,
  clusterName: `${prefix}-cluster`,
  apiServiceName: `${prefix}-api`,
  webServiceName: `${prefix}-web`,
});
obs.addDependency(compute);

cdk.Tags.of(app).add('Project', projectName);
cdk.Tags.of(app).add('Env', envName);

app.synth();
