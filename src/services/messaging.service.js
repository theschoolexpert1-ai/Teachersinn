'use strict';

function createMessagingService({ repository, tx, notify, publicUser, directoryVisible, nowIso, HttpError }) {
  return {
    directory(userId,filters){return repository.directory(userId,filters);},
    educator(userId,otherId){const person=publicUser(otherId);if(!person||otherId===userId)throw new HttpError(404,'Educator not found.');const connection=repository.profileConnection(userId,otherId);if(!repository.directoryVisible(otherId)&&connection?.status!=='accepted')throw new HttpError(404,'Educator not found.');return{...person,...(connection||{connection_id:null,status:null,direction:null})};},
    connections:(userId)=>repository.connectionLists(userId),
    listConversations(userId) {
      return repository.listConversations(userId)
        .filter((conversation) => repository.canMessage(userId, conversation.id));
    },
    requestConnection(ctx, otherId) {
      if (otherId === ctx.user.id) throw new HttpError(400, 'You cannot connect with yourself.');
      if (!publicUser(otherId) || !directoryVisible(otherId)) throw new HttpError(404, 'Educator not found.');
      return tx(() => {
        const existing = repository.findConnectionBetween(ctx.user.id, otherId);
        if (existing) {
          if (existing.status === 'pending' && existing.addressee_id === ctx.user.id) {
            repository.updateConnectionStatus(existing.id, 'accepted');
            return { ok: true, status: 'accepted' };
          }
          if (existing.status === 'declined' && existing.requester_id === ctx.user.id) {
            repository.retryConnection(existing.id);
            notify(otherId, `${ctx.user.name} wants to connect with you.`, '#/network/requests');
            return { ok: true, status: 'pending' };
          }
          return { ok: true, status: existing.status };
        }
        repository.insertConnection(ctx.user.id, otherId);
        notify(otherId, `${ctx.user.name} wants to connect with you.`, '#/network/requests');
        return { ok: true, status: 'pending' };
      });
    },
    respondToConnection(ctx, connectionId, action) {
      const connection = repository.findPendingIncoming(connectionId, ctx.user.id);
      if (!connection) throw new HttpError(404, 'Request not found.');
      tx(() => {
        repository.updateConnectionStatus(connection.id, action === 'accept' ? 'accepted' : 'declined');
        if (action === 'accept') notify(connection.requester_id, `${ctx.user.name} accepted your connection request.`, `#/messages/${ctx.user.id}`);
      });
      return { ok: true };
    },
    removeConnection(ctx, connectionId) {
      const connection = repository.findConnection(connectionId);
      if (!connection) throw new HttpError(404, 'Connection not found.');
      const participant = connection.requester_id === ctx.user.id || connection.addressee_id === ctx.user.id;
      const mayCancel = connection.status === 'pending' && connection.requester_id === ctx.user.id;
      const mayRemove = connection.status === 'accepted' && participant;
      if (!mayCancel && !mayRemove) throw new HttpError(403, 'You cannot change this connection.');
      repository.deleteConnection(connectionId);
      return { ok: true };
    },
    getConversation(ctx, otherId) {
      const person = publicUser(otherId);
      if (!person) throw new HttpError(404, 'Educator not found.');
      if (!repository.canMessage(ctx.user.id, otherId)) throw new HttpError(403, 'This conversation is available only to accepted connections.');
      repository.markConversationRead(otherId, ctx.user.id, nowIso());
      return { person, canMessage: true, messages: repository.listMessages(ctx.user.id, otherId) };
    },
    sendMessage(ctx, otherId, body) {
      if (!publicUser(otherId)) throw new HttpError(404, 'Educator not found.');
      if (!repository.canMessage(ctx.user.id, otherId)) throw new HttpError(403, 'You can message educators once you are connected.');
      tx(() => {
        repository.insertMessage(ctx.user.id, otherId, body);
        notify(otherId, `New message from ${ctx.user.name}.`, `#/messages/${ctx.user.id}`);
      });
      return { ok: true };
    },
  };
}

module.exports = { createMessagingService };
