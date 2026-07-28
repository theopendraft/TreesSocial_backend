import dotenv from "dotenv";
import { jest } from "@jest/globals";

dotenv.config({ path: ".env.test" });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_12345";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/trees-social-test";

jest.setTimeout(30000);
