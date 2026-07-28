import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import UserInteraction from "../models/UserInteraction.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/social-media-platform";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { aBy: "auto", bBy: "auto" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--a" && args[i + 1]) out.a = args[++i];
    else if (a === "--b" && args[i + 1]) out.b = args[++i];
    else if (a === "--aBy" && args[i + 1]) out.aBy = args[++i];
    else if (a === "--bBy" && args[i + 1]) out.bBy = args[++i];
  }
  return out;
}

async function resolveUser(identifier, by) {
  const mode = (by || "auto").toLowerCase();
  if (mode === "id") return await User.findById(identifier);
  if (mode === "email")
    return await User.findOne({ email: identifier.toLowerCase() });
  if (mode === "username")
    return await User.findOne({ username: identifier.toLowerCase() });
  // auto: infer by presence of @
  if (identifier.includes("@")) {
    const byEmail = await User.findOne({ email: identifier.toLowerCase() });
    if (byEmail) return byEmail;
  }
  return await User.findOne({ username: identifier.toLowerCase() });
}

async function ensureReciprocalLikes(aId, bId) {
  const likeAB = await UserInteraction.recordInteraction(
    aId,
    bId,
    "like",
    "matching"
  );
  await UserInteraction.recordInteraction(bId, aId, "like", "matching");
  try {
    await likeAB.checkForMatch();
  } catch {}
}

async function main() {
  const { a, b, aBy = "auto", bBy = "auto" } = parseArgs();
  if (!a || !b) {
    console.error(
      "Usage: node scripts/match-existing-users.js --a <id|email|username> --b <id|email|username> [--aBy id|email|username] [--bBy id|email|username]"
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
  });

  try {
    const [userA, userB] = await Promise.all([
      resolveUser(a, aBy),
      resolveUser(b, bBy),
    ]);

    if (!userA || !userB) {
      console.error("User resolution failed:", {
        aFound: !!userA,
        bFound: !!userB,
      });
      process.exit(2);
    }

    if (String(userA._id) === String(userB._id)) {
      console.error("Both identifiers resolve to the same user.");
      process.exit(3);
    }

    await ensureReciprocalLikes(userA._id, userB._id);

    console.log("Ensured mutual match between:");
    console.log(
      `A: ${userA.username} (${userA.email}) -> ${userA._id.toString()}`
    );
    console.log(
      `B: ${userB.username} (${userB.email}) -> ${userB._id.toString()}`
    );
    console.log(
      "Open Arcade → Matches for either account to see the match after a refresh."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (e) => {
  console.error("match-existing-users failed:", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
