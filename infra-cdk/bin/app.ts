#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AIStack } from '../lib/ai-stack';
import { ComputeStack } from '../lib/compute-stack';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'ontology-mfg';
const envName = app.node.tryGetContext('envName') ?? 'dev';
const retailVpcExportName = app.node.tryGetContext('retailVpcExportName')
  ?? 'ontology-retail-dev-vpc-id';
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-2' };

// Optional subnet ID overrides for synth-time VPC stub (non-lookup VPCs require explicit
// subnet IDs for constructs that enumerate subnets, e.g. Aurora DatabaseCluster).
// Pass via: --context privateSubnetIds=subnet-a,subnet-b,subnet-c
const privateSubnetIdsCtx: string | undefined = app.node.tryGetContext('privateSubnetIds');
const publicSubnetIdsCtx:  string | undefined = app.node.tryGetContext('publicSubnetIds');
const privateSubnetIds = privateSubnetIdsCtx ? privateSubnetIdsCtx.split(',') : undefined;
const publicSubnetIds  = publicSubnetIdsCtx  ? publicSubnetIdsCtx.split(',')  : undefined;

const network = new NetworkStack(app, `${projectName}-${envName}-network`, {
  env, projectName, envName, retailVpcExportName,
  ...(privateSubnetIds ? { privateSubnetIds } : {}),
  ...(publicSubnetIds  ? { publicSubnetIds  } : {}),
});

const data = new DataStack(app, `${projectName}-${envName}-data`, {
  env, projectName, envName,
  vpc: network.vpc,
  neptuneSg: network.neptuneSg,
  auroraSg: network.auroraSg,
});
data.addDependency(network);

const ai = new AIStack(app, `${projectName}-${envName}-ai`, {
  env, projectName, envName,
  rawDocsBucketArn: data.buckets.rawDocs.bucketArn,
  osCollectionArn: cdk.Fn.importValue(`${projectName}-${envName}-os-collection-arn`),
});
ai.addDependency(data);

const compute = new ComputeStack(app, `${projectName}-${envName}-compute`, {
  env, projectName, envName,
  vpc: network.vpc,
  albSg: network.albSg, webSg: network.webSg, apiSg: network.apiSg,
});
compute.addDependency(network);
compute.addDependency(data);

app.synth();
