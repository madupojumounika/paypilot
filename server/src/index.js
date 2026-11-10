import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/db.js';

const port = Number(process.env.PORT) || 4000;
try {
  await connectDatabase();
  app.listen(port, () => console.log('PayPilot API listening on port ' + port));
} catch (error) {
  console.error('Unable to start PayPilot API:', error.message);
  process.exit(1);
}
