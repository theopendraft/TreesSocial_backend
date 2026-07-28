import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import UserInteraction from "../models/UserInteraction.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/social-media-platform";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--for=")) out.for = a.split("=")[1];
    else if (a === "--for" && args[i + 1]) out.for = args[++i];
  }
  return out;
}

async function ensureDemoPartner() {
  const ts = Date.now();
  const username = `arcade_test_${ts}`;
  const email = `${username}@example.com`;

  const demo = new User({
    username,
    email,
    password: "Arcade@1234",
    name: "Arcade Test",
    avatar: "https://i.pravatar.cc/300?img=12",
    bio: "Temporary demo user for Arcade match testing",
    location: "Test City",
    isStreamer: false,
    isVerified: false,
    status: "active",
  });
  await demo.save();
  return demo;
}

async function createMutualLike(userAId, userBId) {
  const likeAB = await UserInteraction.recordInteraction(
    userAId,
    userBId,
    "like",
    "matching"
  );
  await UserInteraction.recordInteraction(userBId, userAId, "like", "matching");
  await likeAB.checkForMatch();
}

async function main() {
  const { for: identifier } = parseArgs();
  if (!identifier) {
    console.error(
      "Usage: node scripts/seed-arcade-match.js --for <email|username>"
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("Connected to MongoDB");

    const me = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });
    if (!me) {
      console.error(`User not found for identifier: ${identifier}`);
      process.exit(2);
    }

    const partner = await ensureDemoPartner();
    await createMutualLike(me._id, partner._id);

    console.log(
      `Created match between ${me.username} (${me._id}) and ${partner.username} (${partner._id}).`
    );
    console.log(
      "You can now open the Arcade matches list to see the new match."
    );
  } catch (e) {
    console.error("Failed to create test match:", e);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
