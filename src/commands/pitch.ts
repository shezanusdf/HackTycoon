import { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { getOrCreateUser, updateBalance, prisma } from "../database/queries";

const PITCH_OUTCOMES = [
  // Fail (50% chance) - lose your money
  { text: "VCs weren't interested... 😔", multiplier: 0, rarity: "fail" },
  { text: "They said 'we'll get back to you' 💀", multiplier: 0, rarity: "fail" },
  { text: "No product-market fit 📉", multiplier: 0, rarity: "fail" },
  
  // Small win (30% chance) - 1.5x
  { text: "Got a small seed round! 🌱", multiplier: 1.5, rarity: "small" },
  { text: "Angel investor interested! 😊", multiplier: 1.5, rarity: "small" },
  
  // Medium win (15% chance) - 2x
  { text: "Series A secured! 🚀", multiplier: 2, rarity: "medium" },
  { text: "Top-tier VC said YES! 💼", multiplier: 2, rarity: "medium" },
  
  // Big win (4% chance) - 3x
  { text: "Sequoia is IN! 🔥", multiplier: 3, rarity: "big" },
  { text: "a16z wants to lead! 💎", multiplier: 3, rarity: "big" },
  
  // Jackpot (1% chance) - 5x
  { text: "Y COMBINATOR ACCEPTED YOU! 🌟", multiplier: 5, rarity: "jackpot" }
];

function getRandomPitchOutcome() {
    const roll = Math.random() * 100;

    if (roll < 1) {
        const jackpots = PITCH_OUTCOMES.filter(o => o.rarity === "jackpot")
        return jackpots[Math.floor(Math.random() * jackpots.length)];
    }

    if (roll < 5) {
        const bigs = PITCH_OUTCOMES.filter(o => o.rarity === "big")
        return bigs[Math.floor(Math.random() * bigs.length)];
    }
    
    if (roll < 20) {
        const mediums = PITCH_OUTCOMES.filter(o => o.rarity === "medium")
        return mediums[Math.floor(Math.random() * mediums.length)];
    }

    if (roll < 50) {
        const smalls = PITCH_OUTCOMES.filter(o => o.rarity === "small")
        return smalls[Math.floor(Math.random() * smalls.length)];
    }

    // 50% - Fail
    const fails = PITCH_OUTCOMES.filter(o => o.rarity === "fail")
    return fails[Math.floor(Math.random() * fails.length)];
}

export async function handlePitch(args: SlackCommandMiddlewareArgs) {
    const { command, ack, say, respond } = args;
    await ack();

    try {
        const slackId = command.user_id;
        const username = command.user_name;
        const channelId = command.channel_id;

        const betAmount = parseInt(command.text);

    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
        await respond({
            text: '❌ Usage: `/pitch <amount>`\nExample: `/pitch 500`',
            response_type: "ephemeral"
        });
        return;
    }

    const user = await getOrCreateUser(slackId, username, channelId);

    if (user.balance < betAmount) {
        await respond({
            text: `❌ Not enough HC! You have $${user.balance} HC but tried to bet $${betAmount} HC.\n\nUse \`/work\` to earn more!`,
            response_type: 'ephemeral'
        });
        return;
    }

    const outcome = getRandomPitchOutcome();

    const winnings = Math.floor(betAmount * outcome.multiplier);
    const profit = winnings - betAmount;

    await updateBalance(slackId, channelId, profit);
    
    const UpdatedUser = await prisma.user.findUnique({
        where: {slackId_channelId: { slackId, channelId }}
    });

    let message = ""

    if (outcome.rarity === "jackpot") {
    message = `✨✨✨ JACKPOT! ✨✨✨\n\n${outcome.text}\n\n`;
    } else if (outcome.rarity === "big") {
        message = `🔥 BIG WIN! 🔥\n\n${outcome.text}\n\n`;
    } else if (outcome.rarity === "medium") {
        message = `💰 WIN!\n\n${outcome.text}\n\n`;
    } else if (outcome.rarity === "small") {
        message = `✅ Small win!\n\n${outcome.text}\n\n`;
    } else {
        message = `💸 *Pitching to VCs...*\n\n${outcome.text}\n\n`;
    }

    message += `Bet: $${betAmount} HC\n`;

    if (profit > 0) {
    message += `Won: $${winnings} HC (${outcome.multiplier}x)\n`;
    message += `Profit: +$${profit} HC 📈\n\n`;
    } else if (profit === 0) {
        message += `Got your money back! $${betAmount} HC\n\n`;
    } else {
        message += `Lost: $${betAmount} HC 📉\n\n`;
    }

    message += `Balance: *$${UpdatedUser?.balance} HC*`;

    await say({
        text: `You're pitching... ${outcome.text}`, 
        blocks: [
        {
            type: "header",
            text: {
            type: "plain_text",
            text: outcome.rarity === "jackpot" ? "✨ JACKPOT ✨" :
                    outcome.rarity === "big" ? "🔥 BIG WIN 🔥" :
                    outcome.rarity === "medium" ? "💰 WIN 💰" :
                    outcome.rarity === "small" ? "✅ Small Win" :
                    "💸 Pitching to VCs...",
            emoji: true
            }
        },
        {
            type: "section",
            text: {
            type: "mrkdwn",
            text: `*${outcome.text}*`
            }
        },
        {
            type: "divider"
        },
        {
            type: "section",
            fields: [
            {
                type: "mrkdwn",
                text: `*💵 Bet Amount*\n$${betAmount} HC`
            },
            {
                type: "mrkdwn",
                text: `*🎲 Multiplier*\n${outcome.multiplier}x`
            }
            ]
        },
        {
            type: "section",
            fields: [
            {
                type: "mrkdwn",
                text: profit > 0
                ? `*📈 Profit*\n+$${profit} HC`
                : profit === 0
                ? `*➡️ Result*\nBreak even`
                : `*📉 Loss*\n-$${Math.abs(profit)} HC`
            },
            {
                type: "mrkdwn",
                text: `*💼 Balance*\n$${UpdatedUser?.balance} HC`
            }
            ]
        },
        {
            type: "context",
            elements: [
            {
                type: "mrkdwn",
                text: profit > 0 ? "🎉 Nice win!" : profit === 0 ? "😐 Better luck next time" : "💀 Tough break"
            }
            ]
        }
        ]


    });
    } catch (error) {
        console.error('Error in pitch command:', error);
        await respond({
            text: '❌ Something went wrong with your pitch! Please try again.',
            response_type: 'ephemeral'
        });
    }
}