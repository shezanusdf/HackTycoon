import { getOrCreateUser, prisma } from "../database/queries";

const BASE_DAILY_AMOUNT = 100;
const STREAK_BONUS_MULTIPLIER = 0.1; // 10% per day

export async function handleDaily(args: any) {
    const { command, ack, say, respond } = args;
    await ack();

    try {
        const slackId = command.user_id;
        const username = command.user_name;
        const channelId = command.channel_id;

        const user = await getOrCreateUser(slackId, username, channelId);

        // Check if already claimed today
        if (user.lastDaily) {
            const now = new Date();
            const lastDaily = new Date(user.lastDaily);
            const hoursSince = (now.getTime() - lastDaily.getTime()) / 1000 / 60 / 60;

            if (hoursSince < 24) {
                const hoursLeft = Math.ceil(24 - hoursSince);
                await respond({
                    text: `⏰ You already claimed your daily bonus! Come back in ${hoursLeft} hour(s).`,
                    response_type: 'ephemeral'
                });
                return;
            }
        }

        // Calculate streak
        let newStreak = 1;
        if (user.lastDaily) {
            const now = new Date();
            const lastDaily = new Date(user.lastDaily);
            const hoursSince = (now.getTime() - lastDaily.getTime()) / 1000 / 60 / 60;

            // If claimed within 48 hours, continue streak
            if (hoursSince < 48) {
                newStreak = (user.dailyStreak || 0) + 1;
            }
        }

        // Calculate bonus with streak
        const streakMultiplier = 1 + ((newStreak - 1) * STREAK_BONUS_MULTIPLIER);
        const dailyAmount = Math.floor(BASE_DAILY_AMOUNT * streakMultiplier);
        const randomBonus = Math.floor(Math.random() * 100); // 0-99 extra
        const totalAmount = dailyAmount + randomBonus;

        // Update user
        await prisma.user.update({
            where: { slackId_channelId: { slackId, channelId } },
            data: {
                balance: { increment: totalAmount },
                lastDaily: new Date(),
                dailyStreak: newStreak
            }
        });

        const updatedUser = await prisma.user.findUnique({
            where: { slackId_channelId: { slackId, channelId } }
        });

        await say({
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🎁 DAILY BONUS 🎁',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${slackId}> claimed their daily bonus!`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `💰 *Base Bonus:* \`$${BASE_DAILY_AMOUNT} HC\`\n🔥 *Streak Bonus:* \`${newStreak} day${newStreak > 1 ? 's' : ''} (+${Math.floor((newStreak - 1) * STREAK_BONUS_MULTIPLIER * 100)}%)\`\n🎲 *Random Bonus:* \`+$${randomBonus} HC\`\n\n✨ *Total Earned:* \`\`\`+$${totalAmount.toLocaleString()} HC\`\`\``
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Balance:* \`$${updatedUser?.balance.toLocaleString()} HC\``
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `🔥 ${newStreak} day streak! Come back tomorrow to keep it going!`
                        }
                    ]
                }
            ]
        });

    } catch (error) {
        console.error('Error in daily command:', error);
        await respond({
            text: '❌ Something went wrong! Please try again.',
            response_type: 'ephemeral'
        });
    }
}
