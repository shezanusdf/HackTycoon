import { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { getOrCreateUser, canWork, prisma } from "../database/queries";
const WORK_OUTCOMES = [
  // Common (70% chance)
  { text: "You shipped a feature! :tada:", amount: 75, rarity: "common" },
  { text: "Code review approved! :tick-daamin:", amount: 60, rarity: "common" },
  { text: "Fixed a critical bug! :bug:", amount: 100, rarity: "common" },
  { text: "Your PR got merged! :rocket:", amount: 80, rarity: "common" },
  { text: "Tests passed! :sparkles:", amount: 50, rarity: "common" },
  { text: "Refactored legacy code! :wrench:", amount: 65, rarity: "common" },

  // Uncommon (20% chance)
  { text: "Optimized database queries! :zap:", amount: 150, rarity: "uncommon" },
  { text: "Mentored a junior dev! :books:", amount: 180, rarity: "uncommon" },
  { text: "Deployed to production! :rocket:", amount: 200, rarity: "uncommon" },

  // Rare (8% chance)
  { text: "Got promoted to Senior! :rocket:", amount: 500, rarity: "rare" },
  { text: "Open source contribution merged! :star:", amount: 750, rarity: "rare" },

  // Epic (1.5% chance)
  { text: "Won a hackathon! :trophy:", amount: 2500, rarity: "epic" },
  { text: "Landed a FAANG interview! :briefcase:", amount: 3000, rarity: "epic" },

  // Legendary (0.5% chance)
  { text: "GOT ACQUIRED BY GOOGLE! :flying_money_with_wings:", amount: 10000, rarity: "legendary" },
  { text: "YC ACCEPTED YOUR STARTUP! :rocket:", amount: 15000, rarity: "legendary" }
];

const COOLDOWN_MINUTES = 5;

function isSameDay(date1: Date, date2: Date){
        return date1.toDateString() === date2.toDateString();
    };

function isYesterday(lastDate: Date, today: Date) {
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        return isSameDay(lastDate, yesterday)
    };

function getStreakBonus(streak: number): number {
        if (streak === 7) return 500;
        if (streak === 30) return 5000;
        if (streak === 100) return 50000;
        return 0;
    };

function getRandomOutcome() {
    const roll = Math.random() * 100;

    if (roll < 0.5) {
        const legendaries = WORK_OUTCOMES.filter(o => o.rarity === "legendary");
        return legendaries[Math.floor(Math.random() * legendaries.length)];
    }

    if(roll < 2) {
        const epics = WORK_OUTCOMES.filter(o => o.rarity === "epic");
        return epics[Math.floor(Math.random() * epics.length)];
    }

    if(roll < 10) {
        const rares = WORK_OUTCOMES.filter(o => o.rarity === "rare");
        return rares[Math.floor(Math.random() * rares.length)];
    }

    if(roll < 30) {
        const uncommons = WORK_OUTCOMES.filter(o => o.rarity === "uncommon");
        return uncommons[Math.floor(Math.random() * uncommons.length)];
    }

    
    const commons = WORK_OUTCOMES.filter(o => o.rarity === "common");
    return commons[Math.floor(Math.random() * commons.length)];

}

export async function handleWork(args: SlackCommandMiddlewareArgs) {
    const { command, ack, say, respond } = args;
    await ack();

    try {
        const slackId = command.user_id;
        const username = command.user_name;
        const channelId = command.channel_id;

        //check cooldown
        const canDoWork = await canWork(slackId, channelId, COOLDOWN_MINUTES);
    if (!canDoWork) {
        await respond({
            text: '⏰ You\'re still working on the last feature! Try again in a few minutes.',
            response_type: 'ephemeral' 
        });
        return;
    }

    //get or create user
    const user = await getOrCreateUser(slackId, username, channelId);

    //streak vars
    const today = new Date();
    let newStreak = 1;
    let streakBonus = 0;
    
    

    if (user.lastStreakDate) {
        if (isSameDay(user.lastStreakDate, today)) {
            newStreak = user.currentStreak;

        } else if (isYesterday(user.lastStreakDate, today)) {
            newStreak = user.currentStreak + 1;
    
        } else {
            newStreak = 1;
        }

    } else {
        newStreak = 1;
    }

    streakBonus = getStreakBonus(newStreak);

    const newLongestStreak = Math.max(newStreak, user.longestStreak);

    const outcome = getRandomOutcome();

    const totalEarnings = outcome.amount + streakBonus;

    // OPTIMIZED: Single database query instead of 3
    const UpdatedUser = await prisma.user.update({
        where: {
            slackId_channelId: { slackId, channelId }
        },
        data: {
            balance: { increment: totalEarnings },
            totalEarned: { increment: totalEarnings },
            lastWork: new Date(),
            lastStreakDate: today,
            currentStreak: newStreak,
            longestStreak: newLongestStreak,
            timesWorked: { increment: 1 }
        }
    });
    
    let message = "";
    if (outcome.rarity === "legendary") {
        message = `✨✨✨ LEGENDARY DROP! ✨✨✨\n\n${outcome.text}\n`;
    } else if (outcome.rarity === "epic") {
        message = `🌟 EPIC DROP! 🌟\n\n${outcome.text}\n`;
    } else if (outcome.rarity === "rare") {
        message = `💎 RARE DROP!\n\n${outcome.text}\n`;
    } else if (outcome.rarity === "uncommon") {
        message = `⚡ UNCOMMON!\n\n${outcome.text}\n`;
    } else {
        message = `💻 *You're grinding...*\n\n${outcome.text}\n`;
    }

    if (streakBonus > 0) {
    message += `💰 Work: +$${outcome.amount} HC\n`;
    message += `🔥 Streak bonus (${newStreak} days): +$${streakBonus} HC\n`;
    message += `*Total: +$${totalEarnings} HC*`;
    } else {
        message += `*+$${totalEarnings} HC*`;
    }

    message += `Balance: *$${UpdatedUser?.balance} HC*`

    if (outcome.rarity === "legendary") {
        await say({
            text: `:star: *LEGENDARY DROP!* :star:\n<@${slackId}> just hit: ${outcome.text}\n:flying_money_with_wings: +$${outcome.amount.toLocaleString()} HC!`
        });
    }

    await say({
        text: `You're grinding... ${outcome.text} +$${totalEarnings} HC`, 
        blocks: [
        {
            type: "header",
            text: {
            type: "plain_text",
            text: outcome.rarity === "legendary" ? "✨ LEGENDARY DROP ✨" :
                    outcome.rarity === "epic" ? "🌟 EPIC DROP 🌟" :
                    outcome.rarity === "rare" ? "💎 RARE DROP 💎" :
                    outcome.rarity === "uncommon" ? "⚡ UNCOMMON ⚡" :
                    "💻 Grinding Session",
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
            fields: streakBonus > 0 ? [
                {
                    type: "mrkdwn",
                    text: `*:flying_money_with_wings: Earnings*\n\`\`\`+$${totalEarnings.toLocaleString()} HC\`\`\``
                },
                {
                    type: "mrkdwn",
                    text: `*:fire: Streak Bonus*\n${newStreak} days (+$${streakBonus.toLocaleString()} HC)`
                }
            ] : [
                {
                    type: "mrkdwn",
                    text: `*:flying_money_with_wings: Earnings*\n\`\`\`+$${totalEarnings.toLocaleString()} HC\`\`\``
                }
            ]
        },
        {
            type: "divider"
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*:coin-mario: Wallet Balance*\n\`\`\`$${UpdatedUser?.balance.toLocaleString()} HC\`\`\``
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*:bank-pride: Bank Balance*\n\`\`\`$${UpdatedUser?.bank.toLocaleString()} HC\`\`\``
            }
        },
        {
            type: "context",
            elements: [
            {
                type: "mrkdwn",
                text: `⏰ Next work available in ${COOLDOWN_MINUTES} minutes`
            }
            ]
        }
]


    });
    } catch (error) {
        console.error('Error in work command:', error);
        await respond({
            text: '❌ Something went wrong! Please try again.',
            response_type: 'ephemeral'
        });
    }
} 
