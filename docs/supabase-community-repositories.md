# Supabase Stage 3E: community, networking, messaging, and notifications

## Status

Stage 3E repositories are validated while SQLite and legacy authentication remain active. Migration `202611190007_community_network_security.sql` is applied to the dedicated development project. The gated four-identity cloud suite passes, and independent cleanup verification is clean.

## Compatibility matrix

| Domain | Existing SQLite methods | PostgreSQL methods | Authorization | Tests |
| --- | --- | --- | --- | --- |
| Teacher discovery | `directory`, `directoryVisible`, `profileConnection` | `directory`, `educator` | Active, visible professional profiles; accepted connection exception for detail | Contract + cloud prepared |
| Connections | `connectionLists`, `findConnectionBetween`, `insertConnection`, `updateConnectionStatus`, `retryConnection`, `deleteConnection` | `lists`, `status`, `request`, `respond`, `remove` | Requester/addressee and transaction identity | Contract + concurrency cloud prepared |
| Messaging | `canMessage`, `listConversations`, `markConversationRead`, `listMessages`, `insertMessage` | `conversations`, `conversation`, `send` | Accepted connection or active mentorship; participants only | Privacy + concurrency cloud prepared |
| Community | `communities`, `discussions`, `communityPosts`, `postDetail`, `replies`, create/delete methods | `communities`, `discussions`, `communityPosts`, `detail`, `createPost`, `reply`, `deleteReply`, `deletePost` | Authenticated read; author-owned writes | Contract + cloud prepared |
| Notifications | `unread`, `preview`, `total`, `page`, `counts`, `markOne`, `markAll` | `unread`, `preview`, `list`, `markOne`, `markAll` | Owner UUID only | Ownership + cloud prepared |
| Moderation | Administrator post/reply deletion through community service | `statistics`, `discussions`, `removePost`, `removeReply` | Authoritative `public.is_admin()` | Denial + cloud prepared |

Unsupported reactions, likes, votes, bookmarks, reports, realtime messaging, email delivery, and push delivery remain out of scope.

## Privacy and lifecycle rules

Discovery returns the existing professional profile fields only. It never selects Auth email, password material, account metadata, career-private data, or notification preferences. Hidden profiles are available only through a narrow function when the viewer has an accepted connection.

Connection statuses remain `pending`, `accepted`, and `declined`. An unordered unique index and transaction advisory lock prevent duplicate or reverse-direction records. A reverse pending request follows the existing application behavior and converges to `accepted`. Only the addressee can explicitly accept or decline; pending requests can be cancelled by their requester and accepted connections by either participant.

Messaging remains eligible only for accepted connections or active mentorships. The database locks the eligibility row while inserting the message and its preference-aware notification, so connection removal cannot race an unauthorized send. Conversations are deterministic by timestamp and ID and limited to 200 messages, matching the current UI boundary. No Realtime or WebSocket architecture is introduced.

## Community and moderation

Authenticated teachers can list communities, discussions, and replies. Posts and replies bind authorship to `auth.uid()`. Reply creation and its notification are one database transaction, with a short duplicate-suppression lock matching the existing ten-second behavior. Owners delete their own content under RLS. Administrator moderation uses a narrowly scoped security-definer function, verifies `public.is_admin()`, and writes an audit entry.

The current application has no report queue or reaction system, so neither is added.

## Notifications and preferences

Notifications retain the existing link-derived categories: messages, connections, community, workshops, learning, mentorship, support, and system. Reads and read-state updates remain owner-scoped by both explicit UUID filters and RLS. Arbitrary notification insertion is not granted to authenticated clients.

The Stage 3B `notification_preferences` repository is reused unchanged. Atomic connection, message, and community-reply functions consult the existing `connections`, `messages`, and `community` preferences. Missing preference rows preserve the existing enabled-by-default behavior.

## Database and transaction boundaries

Migration 007 adds no tables and changes no existing RLS policy. It adds one unordered connection-pair index and narrowly granted functions for profile detail, connection lifecycle, messages, community replies, and moderation. Internal preference evaluation is not executable by clients. All security-definer functions use an empty search path and derive identity from `auth.uid()`.

Cloud coverage uses four disposable identities and validates discovery, hidden profiles, reverse request concurrency, explicit decline, unauthorized response, messaging eligibility, conversation privacy, concurrent messages, preference suppression, community ownership, moderation and its audit entry, notification ownership/read state, privilege-escalation prevention, rollback consistency, connection removal, administrator denial, transaction-local identity, pool reuse, and captured cleanup. Independent inventory confirmed zero Auth users, zero rows in every application table, zero Storage objects, four preserved buckets, and RLS on every public table.

## Stage 3F prerequisites

- Preserve the synchronized migration 007 state and require fresh project-specific authorization for any future cloud mutations.
- Keep the passing `RUN_STAGE3E_MUTATIONS=1` suite and independent cleanup inventory as the Stage 3E security baseline.
- Keep SQLite, legacy authentication, existing API routes, and frontend behavior active until a later authorized cutover.
