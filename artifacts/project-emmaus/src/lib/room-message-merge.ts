import type { RoomMessage } from '@/lib/rooms-types';

function hasSameAttachment(a: RoomMessage, b: RoomMessage): boolean {
  if (!a.attachment && !b.attachment) return true;
  if (!a.attachment || !b.attachment) return false;
  return (
    a.attachment.objectPath === b.attachment.objectPath &&
    a.attachment.type === b.attachment.type &&
    a.attachment.filename === b.attachment.filename &&
    a.attachment.size === b.attachment.size
  );
}

function isServerEchoOfOptimistic(optimistic: RoomMessage, server: RoomMessage): boolean {
  if (!optimistic.id.startsWith('opt-') || server.id.startsWith('opt-')) return false;
  if (
    optimistic.clientMessageId &&
    server.clientMessageId &&
    optimistic.clientMessageId === server.clientMessageId
  ) {
    return true;
  }
  const age = new Date(server.createdAt).getTime() - new Date(optimistic.createdAt).getTime();
  return (
    age >= -5_000 &&
    age <= 120_000 &&
    optimistic.userId === server.userId &&
    optimistic.body === server.body &&
    optimistic.discussionId === server.discussionId &&
    hasSameAttachment(optimistic, server)
  );
}

export function mergeRoomMessages(a: RoomMessage[], b: RoomMessage[]): RoomMessage[] {
  const seen = new Map<string, RoomMessage>();
  const all = [...a, ...b];
  const serverMessages = all.filter(message => !message.id.startsWith('opt-'));

  for (const message of serverMessages) {
    if (!seen.has(message.id)) seen.set(message.id, message);
  }
  for (const message of all.filter(item => item.id.startsWith('opt-'))) {
    const hasServerEcho = serverMessages.some(server =>
      isServerEchoOfOptimistic(message, server),
    );
    if (!hasServerEcho) seen.set(message.id, message);
  }
  return Array.from(seen.values()).sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  );
}

export function reconcileSentRoomMessage(
  messages: RoomMessage[],
  optimisticId: string,
  serverMessage: RoomMessage,
): RoomMessage[] {
  return mergeRoomMessages(
    messages.filter(message => message.id !== optimisticId),
    [serverMessage],
  );
}