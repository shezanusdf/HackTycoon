import { prisma } from "../database/queries";

export async function handleLeaderboard(args: any) {
    const { command, ack, say, respond } = args;
    await ack();

    try {
        const channelId = command.channel_id;

        // Get top 10 users by total wealth (balance + bank)
        const users = await prisma.user.findMany({
            where: { channelId },
            orderBy: [
                { balance: 'desc' },
                { bank: 'desc' }
            ],
            take: 10
        });

        if (users.length === 0) {
            await respond({
                text: '📊 No players yet! Be the first to `/work`!',
                response_type: 'ephemeral'
            });
            return;
        }

        // Build leaderboard text
        const leaderboardText = users.map((user, index) => {
            const totalWealth = user.balance + user.bank;
            const robSuccessRate = user.robsAttempted > 0
                ? Math.round((user.robsSucceeded / user.robsAttempted) * 100)
                : 0;
            const coinflipWinRate = user.coinflipsPlayed > 0
                ? Math.round((user.coinflipsWon / user.coinflipsPlayed) * 100)
                : 0;

            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

            return `${medal} <@${user.slackId}>\n   💰 $${totalWealth.toLocaleString()} HC | 🎯 ${robSuccessRate}% rob | 🪙 ${coinflipWinRate}% flip`;
        }).join('\n\n');

        await say({
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🏆 LEADERBOARD 🏆',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Top ${users.length} Richest Players*\n\n${leaderboardText}`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '💡 Tip: Total wealth = Balance + Bank'
                        }
                    ]
                }
            ]
        });

    } catch (error) {
        console.error('Error in leaderboard command:', error);
        await respond({
            text: '❌ Something went wrong! Please try again.',
            response_type: 'ephemeral'
        });
    }
}
