import assert from 'node:assert/strict';
import test from 'node:test';
import { loadVpsMessages, normalizeVpsMessage, saveVpsMessage } from '../src/api/vpsMessages.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const SENDER = '22222222-2222-4222-8222-222222222222';
const RECEIVER = '33333333-3333-4333-8333-333333333333';

test('writes an idempotent tenant-scoped in-app message without requiring email', async () => {
  let payload;
  const saved = await saveVpsMessage({
    sendNotification: async (next) => {
      payload = next;
      return {
        id: '44444444-4444-4444-8444-444444444444',
        companyId: COMPANY,
        body: next.body,
        status: 'QUEUED',
        createdAt: '2026-09-06T00:00:00.000Z',
        data: next.data,
      };
    },
  }, {
    id: SENDER,
    companyId: COMPANY,
  }, {
    clientMutationId: 'message-001',
    recipientUserId: RECEIVER,
    senderEmpId: 'employee-1',
    receiverEmpId: 'employee-2',
    senderName: 'Nguoi gui',
    text: 'Da giao hang xong.',
  });

  assert.deepEqual(payload.channels, ['IN_APP']);
  assert.deepEqual(payload.recipientUserIds, [SENDER, RECEIVER]);
  assert.equal(payload.module, 'HD_MANAGER_MESSAGING');
  assert.equal(payload.data.senderUserId, SENDER);
  assert.equal(payload.data.recipientUserId, RECEIVER);
  assert.equal(saved.text, 'Da giao hang xong.');
  assert.equal(saved.companyId, COMPANY);
});

test('fails closed when an employee does not have a VPS user mapping or requests Zalo delivery', async () => {
  await assert.rejects(
    () => saveVpsMessage({}, { id: SENDER, companyId: COMPANY }, {
      clientMutationId: 'message-002',
      text: 'No recipient',
    }),
    { code: 'VPS_MESSAGE_RECIPIENT_MAPPING_REQUIRED' },
  );
  await assert.rejects(
    () => saveVpsMessage({}, { id: SENDER, companyId: COMPANY }, {
      clientMutationId: 'message-003',
      recipientUserId: RECEIVER,
      text: 'External request',
      channel: 'ZALO',
    }),
    { code: 'ZALO_PROVIDER_APPROVAL_REQUIRED' },
  );
});

test('loads only the signed-in tenant message records', async () => {
  const result = await loadVpsMessages({
    listNotifications: async () => ({
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          companyId: COMPANY,
          body: 'Newest',
          createdAt: '2026-09-06T10:00:00.000Z',
          data: { senderUserId: SENDER, recipientUserId: RECEIVER },
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          companyId: '77777777-7777-4777-8777-777777777777',
          body: 'Other tenant',
          createdAt: '2026-09-06T11:00:00.000Z',
          data: {},
        },
      ],
    }),
  }, { companyId: COMPANY });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].text, 'Newest');
  assert.equal(normalizeVpsMessage(result.items[0]).source, 'hd-connect-vps');
});
