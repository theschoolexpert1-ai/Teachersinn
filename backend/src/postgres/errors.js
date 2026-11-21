'use strict';

class DatabaseError extends Error {
  constructor(status, message, { code = 'DATABASE_ERROR', retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'DatabaseError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function mapDatabaseError(error) {
  if (!error || error instanceof DatabaseError || error.status) return error;
  const code = String(error.code || '');
  if (code === '23505') return new DatabaseError(409, 'The requested change conflicts with an existing record.', { code, cause: error });
  if (code === '23503') return new DatabaseError(409, 'The requested change conflicts with a related record.', { code, cause: error });
  if (code === '23514' || code === '22P02' || code === '22007') return new DatabaseError(400, 'The requested data is invalid.', { code, cause: error });
  if (code === '42501' || code === 'PGRST301') return new DatabaseError(403, 'You are not allowed to perform this operation.', { code, cause: error });
  if (code === '40001' || code === '40P01') return new DatabaseError(409, 'The request conflicted with another update. Please try again.', { code, retryable: true, cause: error });
  if (code === '55000') return new DatabaseError(409, 'The requested operation conflicts with the current resource state.', { code, cause: error });
  if (code === '57014') return new DatabaseError(503, 'The database request timed out. Please try again.', { code, retryable: true, cause: error });
  if (code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)) {
    return new DatabaseError(503, 'The database is temporarily unavailable. Please try again.', { code, retryable: true, cause: error });
  }
  return error;
}

module.exports = { DatabaseError, mapDatabaseError };
