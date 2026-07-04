import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/entities/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  subscribers: ['src/database/subscribers/*.subscriber.ts'],
  synchronize: false,
});
