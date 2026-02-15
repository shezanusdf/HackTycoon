import { getOrCreateUser, updateBalance } from "../database/queries";
import { ITEM_EFFECTS } from "../utils/itemEffects";

// Slot machine symbols with their multipliers and weights
const SLOT_SYMBOLS = [
  { emoji: ":diamond:", multiplier: 2, weight: 30, name: "Diamond" },
  { emoji: ":trophygds:", multiplier: 3, weight: 20, name: "Trophy" },
  { emoji: ":8bit-heart:", multiplier: 1.5, weight: 40, name: "Heart" },
  { emoji: ":8bit-star:", multiplier: 5, weight: 10, name: "Star" }
] as const;

const JACKPOT_MULTIPLIER = 10; // Triple stars = 10x instead of 5x
const MIN_BET = 1;
const MAX_BET = 100000;

function getRandomSymbol(ownedItems: string[] = []) {
  const hasAirpods = ownedItems.includes('headphones');

  const adjustedSymbols = SLOT_SYMBOLS.map(symbol => ({
    ...symbol,
    weight: hasAirpods && (symbol.emoji === ':trophygds:' || symbol.emoji === ':8bit-star:')
    ? symbol.weight * 1.15 // Boosts trophy and star by 15%
    : symbol.weight
  }));

  const totalWeight = adjustedSymbols.reduce((sum,s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;

  for (const symbol of adjustedSymbols) {
    random -= symbol.weight;
    if (random <= 0) return symbol;
  }

  return SLOT_SYMBOLS[0];
}

function generateReel(ownedItems: string[] = []) {
  return [getRandomSymbol(ownedItems), getRandomSymbol(ownedItems), getRandomSymbol(ownedItems)];
}

function calculateWinnings(reels: ReturnType<typeof generateReel>[], betAmount: number) {
  // Check middle row (index 1 of each reel)
  const middleRow = [reels[0][1], reels[1][1], reels[2][1]];

  // Check for 3 matching symbols
  if (middleRow[0].emoji === middleRow[1].emoji && middleRow[1].emoji === middleRow[2].emoji) {
    const symbol = middleRow[0];
    // Jackpot: 3 stars
    if (symbol.emoji === ":8bit-star:") {
      return {
        winAmount: Math.floor(betAmount * JACKPOT_MULTIPLIER),
        multiplier: JACKPOT_MULTIPLIER,
        type: "jackpot",
        symbol: symbol.name
      };
    }
    // Regular 3-match
    return {
      winAmount: Math.floor(betAmount * symbol.multiplier),
      multiplier: symbol.multiplier,
      type: "win",
      symbol: symbol.name
    };
  }

  // Check for 2 matching symbols (half multiplier)
  const counts = middleRow.reduce((acc, s) => {
    acc[s.emoji] = (acc[s.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const matchingSymbol = Object.entries(counts).find(([_, count]) => count === 2);
  if (matchingSymbol) {
    const symbol = SLOT_SYMBOLS.find(s => s.emoji === matchingSymbol[0])!;
    const halfMultiplier = 1 + (symbol.multiplier - 1) / 2;
    return {
      winAmount: Math.floor(betAmount * halfMultiplier),
      multiplier: halfMultiplier,
      type: "small",
      symbol: symbol.name
    };
  }

  // No match - lose bet
  return {
    winAmount: 0,
    multiplier: 0,
    type: "loss",
    symbol: null
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handlePitch(args: any) {
    const { command, ack, say, respond, client } = args;
    await ack();

    try {
        const slackId = command.user_id;
        const username = command.user_name;
        const channelId = command.channel_id;

        const betAmount = parseInt(command.text);

        // Validation
        if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
            await respond({
                text: '❌ Usage: `/pitch <amount>`\nExample: `/pitch 500`',
                response_type: "ephemeral"
            });
            return;
        }

        if (betAmount < MIN_BET || betAmount > MAX_BET) {
            await respond({
                text: `❌ Bet must be between $${MIN_BET.toLocaleString()} HC and $${MAX_BET.toLocaleString()} HC`,
                response_type: "ephemeral"
            });
            return;
        }

        const user = await getOrCreateUser(slackId, username, channelId);

        if (user.balance < betAmount) {
            await respond({
                text: `❌ Not enough HC! You have $${user.balance.toLocaleString()} HC but tried to bet $${betAmount.toLocaleString()} HC.\n\nUse \`/work\` to earn more!`,
                response_type: 'ephemeral'
            });
            return;
        }

        // Generate the reels
        const ownedItems = user.ownedItems ? JSON.parse(user.ownedItems) : [];
        const reels = [generateReel(ownedItems), generateReel(ownedItems), generateReel(ownedItems)];
        const result = calculateWinnings(reels, betAmount);
        const profit = result.winAmount - betAmount;

        // Update balance
        await updateBalance(slackId, channelId, profit);

        // Post initial spinning message
        const spinningReels = [
            [":dice-roll:", ":dice-roll:", ":dice-roll:"],
            [":dice-roll:", ":dice-roll:", ":dice-roll:"],
            [":dice-roll:", ":dice-roll:", ":dice-roll:"]
        ];

        const initialMessage = await say({
            text: `<@${slackId}> is spinning the slots...`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: ":dice-roll: SLOT MACHINE :dice-roll:",
                        emoji: true
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `<@${slackId}> bet \`$${betAmount.toLocaleString()} HC\`\n\n` +
                              `${spinningReels[0][0]} ${spinningReels[1][0]} ${spinningReels[2][0]}\n` +
                              `${spinningReels[0][1]} ${spinningReels[1][1]} ${spinningReels[2][1]}  :point_left:\n` +
                              `${spinningReels[0][2]} ${spinningReels[1][2]} ${spinningReels[2][2]}`
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "🎰 Spinning..."
                        }
                    ]
                }
            ]
        });

        const ts = initialMessage.ts!;

        // Animation: Stop reel 1 after 600ms
        await sleep(600);
        await client.chat.update({
            channel: channelId,
            ts: ts,
            text: `<@${slackId}> is spinning the slots...`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: ":dice-roll: SLOT MACHINE :dice-roll:",
                        emoji: true
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `<@${slackId}> bet \`$${betAmount.toLocaleString()} HC\`\n\n` +
                              `${reels[0][0].emoji} ${spinningReels[1][0]} ${spinningReels[2][0]}\n` +
                              `${reels[0][1].emoji} ${spinningReels[1][1]} ${spinningReels[2][1]}  :point_left:\n` +
                              `${reels[0][2].emoji} ${spinningReels[1][2]} ${spinningReels[2][2]}`
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "🎰 Spinning..."
                        }
                    ]
                }
            ]
        });

        // Animation: Stop reel 2 after 1200ms total
        await sleep(600);
        await client.chat.update({
            channel: channelId,
            ts: ts,
            text: `<@${slackId}> is spinning the slots...`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: ":dice-roll: SLOT MACHINE :dice-roll:",
                        emoji: true
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `<@${slackId}> bet \`$${betAmount.toLocaleString()} HC\`\n\n` +
                              `${reels[0][0].emoji} ${reels[1][0].emoji} ${spinningReels[2][0]}\n` +
                              `${reels[0][1].emoji} ${reels[1][1].emoji} ${spinningReels[2][1]}  :point_left:\n` +
                              `${reels[0][2].emoji} ${reels[1][2].emoji} ${spinningReels[2][2]}`
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "🎰 Spinning..."
                        }
                    ]
                }
            ]
        });

        // Animation: Stop reel 3 and show result after 1800ms total
        await sleep(600);

        // Build result blocks
        const resultBlocks: any[] = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: result.type === "jackpot" ? "✨ JACKPOT! ✨" :
                          result.type === "win" ? `🎉 ${result.symbol?.toUpperCase() || "SYMBOL"} WIN! 🎉` :
                          result.type === "small" ? ":tick-daamin: Small Win!" :
                          "Better luck next time!",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `<@${slackId}> bet \`$${betAmount.toLocaleString()} HC\`\n\n` +
                          `${reels[0][0].emoji} ${reels[1][0].emoji} ${reels[2][0].emoji}\n` +
                          `${reels[0][1].emoji} ${reels[1][1].emoji} ${reels[2][1].emoji}  :point_left:\n` +
                          `${reels[0][2].emoji} ${reels[1][2].emoji} ${reels[2][2].emoji}`
                }
            },
            {
                type: "divider"
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: result.multiplier > 0
                        ? `*Multiplier:* \`${result.multiplier}x\``
                        : `*Result:* No matching symbols`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: profit > 0
                        ? `*:tickerup: PROFIT*\n\`\`\`+$${profit.toLocaleString()} HC\`\`\``
                        : `*:tickerdown: LOSS*\n\`\`\`-$${betAmount.toLocaleString()} HC\`\`\``
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: profit > 0 ? "🔥 Winner! 🔥" : "💀 Better luck next time!"
                    }
                ]
            }
        ];

        await client.chat.update({
            channel: channelId,
            ts: ts,
            text: `<@${slackId}> ${result.type === "jackpot" ? "hit the JACKPOT!" : profit > 0 ? "won!" : "lost"}`,
            blocks: resultBlocks
        });

    } catch (error) {
        console.error('Error in pitch command:', error);
        await respond({
            text: '❌ Something went wrong with your pitch! Please try again.',
            response_type: 'ephemeral'
        });
    }
}