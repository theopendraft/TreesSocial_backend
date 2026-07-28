import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import User from "../models/User.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/social-media-platform";

// Simple pool of avatars
const AVATARS = [
  "https://i.pravatar.cc/300?img=1",
  "https://i.pravatar.cc/300?img=2",
  "https://i.pravatar.cc/300?img=3",
  "https://i.pravatar.cc/300?img=4",
  "https://i.pravatar.cc/300?img=5",
  "https://i.pravatar.cc/300?img=6",
];

const CITIES = [
  "New York",
  "San Francisco",
  "London",
  "Berlin",
  "Tokyo",
  "Mumbai",
  "Bengaluru",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function usernameFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
}

const baseUsers = [
  { name: "Alice Johnson" },
  { name: "Bob Smith" },
  { name: "Carol Davis" },
  { name: "Dave Wilson" },
  { name: "Eva Brown" },
  { name: "Frank Miller" },
  { name: "Grace Lee" },
  { name: "Henry Clark" },
];

async function ensureUsers() {
  const created = [];
  for (const entry of baseUsers) {
    const username = `${usernameFromName(entry.name)}${Math.floor(
      100 + Math.random() * 900
    )}`;
    const email = `${username}@example.com`;
    const password = "Arcade@1234"; // Shared demo password

    // Check existing by email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      created.push({
        id: String(existing._id),
        username: existing.username,
        email: existing.email,
        fullName: existing.name,
        avatar: existing.avatar || null,
        password,
      });
      continue;
    }

    const user = new User({
      username,
      email: email.toLowerCase(),
      password,
      name: entry.name,
      avatar: pick(AVATARS),
      bio: "Demo user for Arcade testing.",
      location: pick(CITIES),
      isStreamer: Math.random() < 0.3,
      isVerified: Math.random() < 0.4,
      status: "active",
    });

    await user.save();

    created.push({
      id: String(user._id),
      username: user.username,
      email: user.email,
      fullName: user.name,
      avatar: user.avatar || null,
      password,
    });
  }
  return created;
}

async function main() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("Connected to MongoDB for seeding");

    const users = await ensureUsers();

    const out = [
      "Demo Users Seeded:",
      ...users.map(
        (u, i) =>
          `${i + 1}. ${u.fullName} (username: ${u.username}, email: ${
            u.email
          }, id: ${u.id})\n   password: ${u.password}\n   avatar: ${u.avatar}`
      ),
    ].join("\n\n");

    const outDir = path.resolve(process.cwd(), "seed-output");
    const outFile = path.join(outDir, "seeded-users.txt");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, out, { encoding: "utf8" });

    console.log(`Wrote details to ${outFile}`);
  } catch (e) {
    console.error("Seeding failed:", e);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
