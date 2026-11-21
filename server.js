'use strict';

// Vercel's zero-configuration Node server detector requires a root or src
// entry point. The application implementation remains backend/src/server.js.
const server = require('./backend/src/server');

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`TeachersInn is running on http://localhost:${port}`);
  });
}

module.exports = server;
