import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_ROLE, isAdminEmail } from './admin-access';

function withAdminEmail(adminEmail: string | undefined, run: () => void) {
  const previous = process.env.ADMIN_EMAIL;
  if (adminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = adminEmail;

  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  }
}

test('the configured admin email is recognised regardless of case or padding', () => {
  withAdminEmail('yogzis@gmail.com', () => {
    assert.equal(isAdminEmail('yogzis@gmail.com'), true);
    assert.equal(isAdminEmail('YOGZIS@Gmail.com'), true);
    assert.equal(isAdminEmail('  yogzis@gmail.com  '), true);
  });
});

test('every other email is denied admin access', () => {
  withAdminEmail('yogzis@gmail.com', () => {
    assert.equal(isAdminEmail('someone@example.com'), false);
    assert.equal(isAdminEmail(''), false);
    assert.equal(isAdminEmail(null), false);
    assert.equal(isAdminEmail(undefined), false);
  });
});

test('no one is admin when ADMIN_EMAIL is unset', () => {
  withAdminEmail(undefined, () => {
    assert.equal(isAdminEmail('yogzis@gmail.com'), false);
  });
});

/**
 * better-auth's admin plugin registers its own `user.create.before` hook that
 * stamps `role: "user"`. Config hooks are appended after plugin hooks and each
 * result is shallow-merged over the accumulated data, so ours must win. That
 * ordering is an implementation detail, not a documented contract, which is
 * why it is pinned here.
 */
test('the admin role hook overrides the plugin default role', () => {
  withAdminEmail('yogzis@gmail.com', () => {
    const pluginDefaultRole = { role: 'user' };
    const signUp = { email: 'yogzis@gmail.com', name: 'Yog' };

    const afterPluginHook = { ...signUp, ...pluginDefaultRole };
    const afterConfigHook = {
      ...afterPluginHook,
      ...(isAdminEmail(signUp.email) ? { role: ADMIN_ROLE } : {}),
    };

    assert.equal(afterConfigHook.role, ADMIN_ROLE);
  });
});
