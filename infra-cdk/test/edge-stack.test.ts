// infra-cdk/test/edge-stack.test.ts
import * as fs from 'fs';
import * as path from 'path';
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

  // The repo's copy of the seed passwords was scrubbed to a placeholder; a custom resource
  // calling adminSetUserPassword would reset both demo logins to it on the next deploy.
  // Credentials live in 1Password, never in the template.
  test('no custom resource sets Cognito passwords', () => {
    const calls = JSON.stringify(template.findResources('Custom::AWS'));
    expect(calls).not.toMatch(/adminSetUserPassword/i);
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

  test('Lambda@Edge runs on a supported Node.js runtime (nodejs20.x is deprecated)', () => {
    // Match the auth function by its inline code — CDK's own helper Lambdas share the handler name.
    const authFns = Object.values(template.findResources('AWS::Lambda::Function')).filter(
      (fn: any) => JSON.stringify(fn.Properties?.Code ?? {}).includes('mfg_id_token'),
    );
    expect(authFns).toHaveLength(1);
    expect((authFns[0] as any).Properties.Runtime).toBe('nodejs22.x');
  });

  describe('viewer-request handler', () => {
    // The template is plain JS with build-time placeholders; run it as-is.
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'lambda-edge', 'index.js.tmpl'), 'utf-8');
    const mod: { exports: any } = { exports: {} };
    new Function('module', 'exports', src)(mod, mod.exports);
    const handler: (e: unknown) => Promise<any> = mod.exports.handler;

    const viewerRequest = (uri: string, cookie?: string) => ({
      Records: [{ cf: { request: { uri, headers: cookie ? { cookie: [{ key: 'Cookie', value: cookie }] } : {} } } }],
    });

    test('unauthenticated viewers go to /api/auth/login, which issues the OAuth state', async () => {
      const res = await handler(viewerRequest('/chat'));
      expect(res.status).toBe('302');
      expect(res.headers.location[0].value).toBe('/api/auth/login');
    });

    test.each(['/api/auth/login', '/api/auth/callback?code=x&state=y', '/api/auth/logout', '/api/auth/whoami'])(
      '%s bypasses the cookie check (the API handles it)',
      async (uri) => {
        const res = await handler(viewerRequest(uri));
        expect(res.uri).toBe(uri);
      },
    );

    test('viewers with the id-token cookie pass through', async () => {
      const res = await handler(viewerRequest('/chat', 'foo=1; mfg_id_token=abc'));
      expect(res.uri).toBe('/chat');
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
