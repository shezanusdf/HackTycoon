import { getOrCreateUser,prisma } from "../database/queries";

const ROB_COOLDOWN_MINUTES = 10;
const ROB_SUCCESS_RATE = 0.50; // 50% chance
const SAME_TARGET_COOLDOWN_HOURS = 1;
const MIN_ROB_AMOUNT = 50;
const MAX_ROB_AMOUNT = 100000;

interface RecentTarget {
    slackId: string;
    timestamp: number
}

async function canRob(slackId: string, channelId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { slackId_channelId: { slackId, channelId } }
    });
    if (!user || !user.lastRob) return true;

    const now = new Date();
    const diffMinutes = (now.getTime() - user.lastRob.getTime()) / 1000 / 60;

    return diffMinutes >= ROB_COOLDOWN_MINUTES;
}

async function canRobTarget(robberslackId: string, targetslackId: string, channelId: string): Promise<boolean> {
    const robber = await prisma.user.findUnique({
        where: { slackId_channelId: { slackId: robberslackId, channelId}}
    });

    if (!robber || !robber.recentRobTargets) return true;

    const recentTargets: RecentTarget[] = JSON.parse(robber.recentRobTargets);
    const now = Date.now();
    const cooldownMs = SAME_TARGET_COOLDOWN_HOURS * 60 * 60 * 1000;

    const recentTarget = recentTargets.find(
        (t) => t.slackId === targetslackId && now - t.timestamp < cooldownMs
    );

    return !recentTarget;
}

async function addRecentTarget(robberslackId: string, targetslackId: string, channelId: string) {
    const robber = await prisma.user.findUnique({
        where: { slackId_channelId: { slackId: robberslackId, channelId}}
    });

    if (!robber) return;

    const recentTargets: RecentTarget[] = robber.recentRobTargets
    ? JSON.parse(robber.recentRobTargets)
    : [];

    //add new target
    recentTargets.push({
        slackId: targetslackId,
        timestamp: Date.now()
    });

    //Clean up targets older than cooldown period

    const now = Date.now()
    const cooldownMs = SAME_TARGET_COOLDOWN_HOURS * 60 * 60 * 1000;
    const cleanedTargets = recentTargets.filter((t) => now - t.timestamp < cooldownMs);
    
    await prisma.user.update({
        where: { slackId_channelId: {slackId: robberslackId, channelId}},
        data: { recentRobTargets: JSON.stringify(cleanedTargets)}
    })
}

export async function handleRob(args: any) {
    const { command, ack, say, respond, client } = args;
    await ack();

    try {
        const robberslackId = command.user_id;
        const robberUsername = command.user_name;
        const channelId = command.channel_id;

        const text = command.text.trim()
        const parts = text.split(/\s+/);

        if (parts.length < 2) {
            await respond({
                text: '❌ Usage: `/rob @user <amount>`\nExample: `/rob @alice 500`',
                response_type: 'ephemeral'
            });
            return;
        }

        //extract target user id
        const targetMention = parts[0];
        const targetSlackId = targetMention.replace(/<@|>/g, '');

        if (!targetSlackId || targetSlackId === robberslackId) {
        await respond({
            text: "❌ You can't rob yourself!",
            response_type: 'ephemeral'
        });
        return;
        }

        // Parse amount
        const robAmount = parseInt(parts[1]);
        if (!robAmount || isNaN(robAmount) || robAmount < MIN_ROB_AMOUNT) {
        await respond({
            text: `❌ Minimum rob amount is $${MIN_ROB_AMOUNT.toLocaleString()} HC`,
            response_type: 'ephemeral'
        });
        return;
        }

        if (robAmount > MAX_ROB_AMOUNT) {
        await respond({
            text: `❌ Maximum rob amount is $${MAX_ROB_AMOUNT.toLocaleString()} HC`,
            response_type: 'ephemeral'
        });
        return;
        }

        // Check robber cooldown
        const canAttemptRob = await canRob(robberslackId, channelId);
        if (!canAttemptRob) {
        await respond({
            text: `⏰ You're laying low... Try again in ${ROB_COOLDOWN_MINUTES} minutes.`,
            response_type: 'ephemeral'
        });
        return;
        }

        // Check same-target cooldown
        const canRobThisTarget = await canRobTarget(robberslackId, targetSlackId, channelId);
        if (!canRobThisTarget) {
        await respond({
            text: `⏰ You already robbed <@${targetSlackId}> recently. Wait ${SAME_TARGET_COOLDOWN_HOURS} hour(s) before targeting them again.`,
            response_type: 'ephemeral'
        });
        return;
        }

        // Get users
        const robber = await getOrCreateUser(robberslackId, robberUsername, channelId);
        const target = await prisma.user.findUnique({
        where: { slackId_channelId: { slackId: targetSlackId, channelId } }
        });

        if (!target) {
        await respond({
            text: "❌ That user hasn't played the game yet!",
            response_type: 'ephemeral'
        });
        return;
        }

        // Check if target has enough in wallet
        if (target.balance < robAmount) {
        await respond({
            text: `❌ <@${targetSlackId}> only has $${target.balance.toLocaleString()} HC in their wallet! (Try robbing less)`,
            response_type: 'ephemeral'
        });
        return;
        }

        // Check if robber can afford penalty
        const penalty = robAmount * 2;
        if (robber.balance < penalty) {
        await respond({
            text: `❌ You need at least $${penalty.toLocaleString()} HC in your wallet to attempt this rob! (If caught, you lose 2x)`,
            response_type: 'ephemeral'
        });
        return;
        }

        // Attempt robbery
        const success = Math.random() < ROB_SUCCESS_RATE;

        // Update robber cooldown and targets
        await addRecentTarget(robberslackId, targetSlackId, channelId);

        if (success) {
        // Success: Take from target, give to robber
        await prisma.user.update({
            where: { slackId_channelId: { slackId: targetSlackId, channelId } },
            data: {
            balance: { decrement: robAmount },
            totalLostToRobbers: { increment: robAmount },
            lastRobbed: new Date()
            }
        });

        await prisma.user.update({
            where: { slackId_channelId: { slackId: robberslackId, channelId } },
            data: {
            balance: { increment: robAmount },
            lastRob: new Date(),
            robsAttempted: { increment: 1 },
            robsSucceeded: { increment: 1 },
            totalStolen: { increment: robAmount }
            }
        });

        await say({
            text: `🎯 <@${robberslackId}> successfully robbed <@${targetSlackId}>!`,
            blocks: [
            {
                type: 'header',
                text: {
                type: 'plain_text',
                text: '🎯 ROBBERY SUCCESS! 🎯',
                emoji: true
                }
            },
            {
                type: 'section',
                text: {
                type: 'mrkdwn',
                text: `<@${robberslackId}> successfully stole \`$${robAmount.toLocaleString()} HC\` from <@${targetSlackId}>!`
                }
            },
            {
                type: 'divider'
            },
            {
                type: 'section',
                text: {
                type: 'mrkdwn',
                text: `💰 *Stolen:* \`\`\`+$${robAmount.toLocaleString()} HC\`\`\``
                }
            },
            {
                type: 'context',
                elements: [
                {
                    type: 'mrkdwn',
                    text: '💡 Tip: Use `/deposit` to keep money safe in your bank!'
                }
                ]
            }
            ]
        });

        // Send DM notification to victim
        try {
            await client.chat.postMessage({
                channel: targetSlackId,
                text: `💀 You were robbed by <@${robberslackId}>!\nThey stole $${robAmount.toLocaleString()} HC from you.\n\n💡 Tip: Use \`/deposit\` to keep money safe in your bank!`
            });
        } catch (err) {
            // User might have DMs disabled, that's okay
        }
        } else {
        // Failure: Robber loses 2x
        await prisma.user.update({
            where: { slackId_channelId: { slackId: robberslackId, channelId } },
            data: {
            balance: { decrement: penalty },
            lastRob: new Date(),
            robsAttempted: { increment: 1 },
            robsFailed: { increment: 1 }
            }
        });

        await say({
            text: `❌ <@${robberslackId}> got caught trying to rob <@${targetSlackId}>!`,
            blocks: [
            {
                type: 'header',
                text: {
                type: 'plain_text',
                text: '❌ CAUGHT! ❌',
                emoji: true
                }
            },
            {
                type: 'section',
                text: {
                type: 'mrkdwn',
                text: `<@${robberslackId}> got caught trying to rob <@${targetSlackId}> for $${robAmount.toLocaleString()} HC!`
                }
            },
            {
                type: 'divider'
            },
            {
                type: 'section',
                text: {
                type: 'mrkdwn',
                text: `💸 *Penalty:* \`\`\`-$${penalty.toLocaleString()} HC\`\`\``
                }
            },
            {
                type: 'context',
                elements: [
                {
                    type: 'mrkdwn',
                    text: '💀 Better luck next time!'
                }
                ]
            }
            ]
        });
        }
    } catch (error) {
        console.error('Error in rob command:', error);
        await respond({
        text: '❌ Something went wrong with your robbery attempt! Please try again.',
        response_type: 'ephemeral'
        });
    }
    }