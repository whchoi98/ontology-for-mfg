// infra-cdk/test/edge-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EdgeStack } from '../lib/edge-stack';

describe('EdgeStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new EdgeStack(app, 'TestEdge', {
      env: { account: '111111111111', region: 'us-east-1' },  // EdgeStack runs in us-east-1
      projectName: 'ontology-mfg',
      envName: 'dev',
      albDnsName: 'mfg-dev-alb-1234.elb.amazonaws.com',
      domainName: 'mfg-ontology.whchoi.net',
      hostedZoneName: 'whchoi.net',
    });
    template = Template.fromStack(stack);
  });

  test('Cognito user pool with self-signup off', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  test('two seed users (admin + demo)', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolUser', 2);
  });

  test('6 user-pool groups', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 6);
  });

  test('CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  test('Lambda@Edge function (viewer-request)', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
    });
  });

  // ADR-007 invariant: SSE paths must NOT enable origin compression,
  // otherwise CloudFront buffers chunks and phase chips arrive in a
  // single burst. The CloudFront distribution must therefore have at
  // least one cache behavior with Compress: false on an /api/* SSE path
  // (the deciding behavior is whichever one routes /api/chat or /api/eight-d).
  // We assert the negative here: at least one cache behavior in the
  // distribution has Compress=false. If the team ever flips compression
  // on globally, this test fails fast.
  test('At least one CloudFront cache behavior has Compress:false (ADR-007)', () => {
    const dists = template.findResources('AWS::CloudFront::Distribution');
    let foundUncompressedBehavior = false;
    for (const dist of Object.values(dists)) {
      const cfg = (dist as any).Properties?.DistributionConfig ?? {};
      const all = [
        cfg.DefaultCacheBehavior,
        ...(cfg.CacheBehaviors ?? []),
      ].filter(Boolean);
      for (const cb of all) {
        if (cb.Compress === false) {
          foundUncompressedBehavior = true;
          break;
        }
      }
    }
    if (!foundUncompressedBehavior) {
      throw new Error(
        'No CloudFront cache behavior has Compress:false — ' +
        'SSE paths require origin compression disabled (ADR-007). ' +
        'Add a separate cache behavior for /api/chat,/api/eight-d,/api/insights ' +
        'with compress=false in EdgeStack.',
      );
    }
  });
});
