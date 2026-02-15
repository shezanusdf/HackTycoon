import { getOrCreateUser, prisma } from "../database/queries";

const MIN_BET = 10;
const MAX_BET = 100000;
const COINFLIP_COOLDOWN_SECONDS = 10;
const DUEL_TIMEOUT_SECONDS = 60;
const HOUSE_FEE = 0.05; // 5% house fee for PvP

async function canCoinflip(slackId: string, channelId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { slackId_channelId: { slackId, channelId } }
    });

    if (!user || !user.lastCoinflip) return true;

    const now = new Date();
    const diffSeconds = (now.getTime() - user.lastCoinflip.getTime()) / 1000;

    return diffSeconds >= COINFLIP_COOLDOWN_SECONDS;
}

export async function handleCoinflip(args: any) {
    const { command, ack, say, respond } = args;
    await ack();

    try {
        const slackId = command.user_id;
        const username = command.user_name;
        const channelId = command.channel_id;

        const text = command.text.trim();
        const parts = text.split(/\s+/);

        // Check if it's a PvP challenge (starts with @)
        if (parts[0] && parts[0].startsWith('<@')) {
            // Delegate to PvP handler
            await handleCoinflipDuel(args);
            return;
        }

        // Solo coinflip
        const betAmount = parseInt(parts[0]);

        if (!betAmount || isNaN(betAmount) || betAmount < MIN_BET) {
            await respond({
                text: `❌ Usage: \`/coinflip <amount>\` or \`/coinflip @user <amount>\`\nExamples:\n• \`/coinflip 100\` - Solo flip\n• \`/coinflip @alice 500\` - Challenge a player\n\nMinimum bet: $${MIN_BET.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        if (betAmount > MAX_BET) {
            await respond({
                text: `❌ Maximum bet is $${MAX_BET.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        // Check cooldown
        const canPlay = await canCoinflip(slackId, channelId);
        if (!canPlay) {
            await respond({
                text: `⏰ Cooldown active! Wait ${COINFLIP_COOLDOWN_SECONDS} seconds between coinflips.`,
                response_type: 'ephemeral'
            });
            return;
        }

        const user = await getOrCreateUser(slackId, username, channelId);

        if (user.balance < betAmount) {
            await respond({
                text: `❌ Not enough HC! You have $${user.balance.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        // Post initial message with buttons
        await say({
            text: `<@${slackId}> is flipping a coin for $${betAmount.toLocaleString()} HC!`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🪙 COINFLIP 🪙',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${slackId}> is betting \`$${betAmount.toLocaleString()} HC\`\n\nChoose your side:`
                    }
                },
                {
                    type: 'actions',
                    block_id: 'coinflip_choice',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '🟡 HEADS',
                                emoji: true
                            },
                            value: JSON.stringify({ betAmount, slackId, channelId }),
                            action_id: 'coinflip_heads',
                            style: 'primary'
                        },
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '⚪ TAILS',
                                emoji: true
                            },
                            value: JSON.stringify({ betAmount, slackId, channelId }),
                            action_id: 'coinflip_tails'
                        }
                    ]
                }
            ]
        });
    } catch (error) {
        console.error('Error in coinflip command:', error);
        await respond({
            text: '❌ Something went wrong! Please try again.',
            response_type: 'ephemeral'
        });
    }
}

// Button handlers for heads/tails (solo)
export async function handleCoinflipChoice(args: any) {
    const { ack, body, client, action } = args;
    await ack();

    try {
        const data = JSON.parse(action.value);
        const { betAmount, slackId, channelId } = data;
        const userId = body.user.id;

        // Security: Only the person who started the flip can choose
        if (userId !== slackId) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: "❌ This isn't your coinflip!"
            });
            return;
        }

        const userChoice = action.action_id === 'coinflip_heads' ? 'HEADS' : 'TAILS';
        const coinResult = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
        const won = userChoice === coinResult;

        const profit = won ? betAmount : -betAmount;

        // Update user
        await prisma.user.update({
            where: { slackId_channelId: { slackId, channelId } },
            data: {
                balance: { increment: profit },
                lastCoinflip: new Date(),
                coinflipsPlayed: { increment: 1 },
                coinflipsWon: won ? { increment: 1 } : undefined
            }
        });

        const updatedUser = await prisma.user.findUnique({
            where: { slackId_channelId: { slackId, channelId } }
        });

        // Update message with result
        await client.chat.update({
            channel: channelId,
            ts: body.message.ts,
            text: `<@${slackId}> ${won ? 'won' : 'lost'} the coinflip!`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: won ? '✅ YOU WON! ✅' : '❌ YOU LOST ❌',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${slackId}> chose **${userChoice}**\nCoin landed on **${coinResult}**`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: won
                            ? `*:tickerup: WIN*\n\`\`\`+$${betAmount.toLocaleString()} HC\`\`\``
                            : `*:tickerdown: LOSS*\n\`\`\`-$${betAmount.toLocaleString()} HC\`\`\``
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
                            text: won ? '🎉 Lucky flip!' : '💀 Try again!'
                        }
                    ]
                }
            ]
        });
    } catch (error) {
        console.error('Error in coinflip choice:', error);
    }
}

// PvP Duel Handler
async function handleCoinflipDuel(args: any) {
    const { command, ack, say, respond, client } = args;

    try {
        const challengerSlackId = command.user_id;
        const challengerUsername = command.user_name;
        const channelId = command.channel_id;

        const text = command.text.trim();
        const parts = text.split(/\s+/);

        // Parse target and amount
        const targetMention = parts[0];
        const targetSlackId = targetMention.replace(/<@|>/g, '');
        const betAmount = parseInt(parts[1]);

        // Validation
        if (!targetSlackId || targetSlackId === challengerSlackId) {
            await respond({
                text: "❌ You can't challenge yourself!",
                response_type: 'ephemeral'
            });
            return;
        }

        if (!betAmount || isNaN(betAmount) || betAmount < MIN_BET) {
            await respond({
                text: `❌ Usage: \`/coinflip @user <amount>\`\nExample: \`/coinflip @alice 500\`\n\nMinimum bet: $${MIN_BET.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        if (betAmount > MAX_BET) {
            await respond({
                text: `❌ Maximum bet is $${MAX_BET.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        // Get both users
        const challenger = await getOrCreateUser(challengerSlackId, challengerUsername, channelId);
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

        // Check both have enough balance
        if (challenger.balance < betAmount) {
            await respond({
                text: `❌ You don't have enough HC! You need $${betAmount.toLocaleString()} HC but only have $${challenger.balance.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        if (target.balance < betAmount) {
            await respond({
                text: `❌ <@${targetSlackId}> doesn't have enough HC! They need $${betAmount.toLocaleString()} HC but only have $${target.balance.toLocaleString()} HC`,
                response_type: 'ephemeral'
            });
            return;
        }

        // Calculate pot and winnings
        const totalPot = betAmount * 2;
        const houseFee = Math.floor(totalPot * HOUSE_FEE);
        const winnerPayout = totalPot - houseFee;

        // Post challenge message
        const message = await say({
            text: `<@${challengerSlackId}> challenged <@${targetSlackId}> to a coinflip duel!`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '⚔️ COINFLIP DUEL ⚔️',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${challengerSlackId}> has challenged <@${targetSlackId}> to a coinflip duel!`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*💰 Bet Amount (each):* \`$${betAmount.toLocaleString()} HC\`\n*🎁 Total Pot:* \`$${totalPot.toLocaleString()} HC\`\n*💸 House Fee (5%):* \`$${houseFee.toLocaleString()} HC\`\n*👑 Winner Gets:* \`$${winnerPayout.toLocaleString()} HC\``
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${targetSlackId}>, do you accept this challenge?`
                    }
                },
                {
                    type: 'actions',
                    block_id: 'duel_response',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '✅ Accept',
                                emoji: true
                            },
                            value: JSON.stringify({
                                challengerSlackId,
                                targetSlackId,
                                betAmount,
                                channelId,
                                timestamp: Date.now()
                            }),
                            action_id: 'duel_accept',
                            style: 'primary'
                        },
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: '❌ Decline',
                                emoji: true
                            },
                            value: JSON.stringify({
                                challengerSlackId,
                                targetSlackId,
                                betAmount,
                                channelId
                            }),
                            action_id: 'duel_decline',
                            style: 'danger'
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `⏰ Challenge expires in ${DUEL_TIMEOUT_SECONDS} seconds`
                        }
                    ]
                }
            ]
        });

        // Auto-cancel after timeout
        setTimeout(async () => {
            try {
                await client.chat.update({
                    channel: channelId,
                    ts: message.ts,
                    text: 'Challenge expired',
                    blocks: [
                        {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: '⏰ CHALLENGE EXPIRED',
                                emoji: true
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `<@${targetSlackId}> didn't respond in time. Challenge cancelled.`
                            }
                        }
                    ]
                });
            } catch (err) {
                // Message might have been updated already
            }
        }, DUEL_TIMEOUT_SECONDS * 1000);

    } catch (error) {
        console.error('Error in coinflip duel:', error);
        await respond({
            text: '❌ Something went wrong! Please try again.',
            response_type: 'ephemeral'
        });
    }
}

// Handler for Accept/Decline buttons
export async function handleDuelResponse(args: any) {
    const { ack, body, client, action } = args;
    await ack();

    try {
        const data = JSON.parse(action.value);
        const { challengerSlackId, targetSlackId, betAmount, channelId, timestamp } = data;
        const userId = body.user.id;

        // Check if timeout expired
        if (timestamp && Date.now() - timestamp > DUEL_TIMEOUT_SECONDS * 1000) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: '❌ This challenge has expired!'
            });
            return;
        }

        // Only target can respond
        if (userId !== targetSlackId) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: "❌ This challenge isn't for you!"
            });
            return;
        }

        if (action.action_id === 'duel_decline') {
            // Declined
            await client.chat.update({
                channel: channelId,
                ts: body.message.ts,
                text: 'Challenge declined',
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: '❌ CHALLENGE DECLINED',
                            emoji: true
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `<@${targetSlackId}> declined the coinflip duel.`
                        }
                    },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: '💔 Maybe next time!'
                            }
                        ]
                    }
                ]
            });
            return;
        }

        // Accepted - Start the duel
        await client.chat.update({
            channel: channelId,
            ts: body.message.ts,
            text: 'Duel accepted! Flipping coin...',
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🪙 DUEL ACCEPTED! 🪙',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${targetSlackId}> accepted the challenge!\n\n🎲 Flipping the coin...`
                    }
                }
            ]
        });

        // Wait a moment for suspense
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Flip the coin
        const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
        const challengerWins = result === 'HEADS';
        const winnerSlackId = challengerWins ? challengerSlackId : targetSlackId;
        const loserSlackId = challengerWins ? targetSlackId : challengerSlackId;

        // Calculate payouts
        const totalPot = betAmount * 2;
        const houseFee = Math.floor(totalPot * HOUSE_FEE);
        const winnerPayout = totalPot - houseFee - betAmount; // Net gain for winner

        // Update balances
        await prisma.user.update({
            where: { slackId_channelId: { slackId: winnerSlackId, channelId } },
            data: {
                balance: { increment: winnerPayout },
                lastCoinflip: new Date(),
                coinflipsPlayed: { increment: 1 },
                coinflipsWon: { increment: 1 }
            }
        });

        await prisma.user.update({
            where: { slackId_channelId: { slackId: loserSlackId, channelId } },
            data: {
                balance: { decrement: betAmount },
                lastCoinflip: new Date(),
                coinflipsPlayed: { increment: 1 }
            }
        });

        // Get updated balances
        const winner = await prisma.user.findUnique({
            where: { slackId_channelId: { slackId: winnerSlackId, channelId } }
        });

        const loser = await prisma.user.findUnique({
            where: { slackId_channelId: { slackId: loserSlackId, channelId } }
        });

        // Show result
        await client.chat.update({
            channel: channelId,
            ts: body.message.ts,
            text: `<@${winnerSlackId}> won the coinflip duel!`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '👑 DUEL COMPLETE! 👑',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `The coin landed on **${result}**!`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*👑 WINNER:* <@${winnerSlackId}>\n\`\`\`+$${winnerPayout.toLocaleString()} HC\`\`\``
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*💀 LOSER:* <@${loserSlackId}>\n\`\`\`-$${betAmount.toLocaleString()} HC\`\`\``
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*<@${winnerSlackId}> Balance*\n\`$${winner?.balance.toLocaleString()} HC\``
                        },
                        {
                            type: 'mrkdwn',
                            text: `*<@${loserSlackId}> Balance*\n\`$${loser?.balance.toLocaleString()} HC\``
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `💸 House fee: $${houseFee.toLocaleString()} HC (5%)`
                        }
                    ]
                }
            ]
        });

    } catch (error) {
        console.error('Error in duel response:', error);
    }
}
