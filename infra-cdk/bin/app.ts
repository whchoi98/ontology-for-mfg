#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'ontology-mfg';
const envName = app.node.tryGetContext('envName') ?? 'dev';
const retailVpcExportName = app.node.tryGetContext('retailVpcExportName')
  ?? 'ontology-retail-dev-vpc-id';
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-2' };

new NetworkStack(app, `${projectName}-${envName}-network`, {
  env, projectName, envName, retailVpcExportName,
});

app.synth();
