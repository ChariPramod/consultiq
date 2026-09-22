import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedUser, authConfigured } from '../server/access.ts';
import { handleApi } from '../server/handler.ts';
test('private access fails closed and uses exact verified IDs', () => {
  assert.equal(authConfigured({}), false);
  assert.equal(
    authConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk' }),
    false,
  );
  assert.equal(allowedUser('user_1', undefined), false);
  assert.equal(allowedUser(null, 'user_1'), false);
  assert.equal(allowedUser('user_1', 'user_10'), false);
  assert.equal(allowedUser('user_1', ' user_1, user_2 '), true);
});
test('Sites identity header can no longer impersonate a user', async () => {
  const response = await handleApi(
    new Request('https://example.test/api/workspace', {
      headers: { 'oai-authenticated-user-id': 'owner-a' },
    }),
    {
      DB: {
        prepare() {
          throw new Error('Database must not be reached');
        },
      },
    },
  );
  assert.equal(response.status, 401);
});
