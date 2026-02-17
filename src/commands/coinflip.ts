import { getOrCreateUser, prisma } from "../database/queries";

const MIN_BET = 10;
const MAX_BET = 100000;
const COINFLIP_COOLDOWN_SECONDS = 5;

async function canCoinflip(slackId: string, channelId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: {slackId_channelId: {slackId, channelId}}
    });

    if (!user || !user.lastCoinflip) return true;
    const diffSeconds = (new Date().getTime() - user.lastCoinflip.getTime()) / 1000
    return diffSeconds >= COINFLIP_COOLDOWN_SECONDS;
}

export async function handleCoinflip(args: any) {
    const {  command,ack,say,respond } = args;
    await ack();

    const slackId = command.user_id;
    const username = command.user_name;
    const channelId = command.channel_id;
    const betAmount = parseInt(command.text.trim());

    if (!betAmount || betAmount < MIN_BET) {
        await respond({ text: `text: Usage: \coinflip <amount>\nMin: $${MIN_BET} HC`, response_type: 'ephemeral' });
        return;
    }

    if (!betAmount || betAmount < MAX_BET) {
        await respond({ text: `text: Usage: \coinflip <amount>\Max: $${MAX_BET} HC`, response_type: 'ephemeral' });
        return;
    }
    if (!(await canCoinflip(slackId, channelId))) {
        await respond({ text: `text:⏰ Wait ${COINFLIP_COOLDOWN_SECONDS}s between flips`, response_type: 'ephemeral' });
        return;
    }

    const user = await getOrCreateUser(slackId,username, channelId);
    if (user.balance < betAmount) {
        await respond({ text: `❌Not Enough! You have $${user.balance.toLocaleString()} HC`, response_type: 'ephemeral'});
        return;
    }

    await say({
        blocks: [
            {type: 'header', text: {type: 'plain_text', text: '🪙 COINFLIP', emoji: true}},
            {type: 'section', text: { type: 'mrkdwn', text: `<@${slackId}> betting $${betAmount.toLocaleString()} HC\nChoose:`}},
            {
                type: 'actions',
                elements: [
                   {type: 'buttons', text: {type: 'plain_text', text: '🟡 HEADS' }, value: JSON.stringify({ betAmount, slackId, channelId}), action_id: 'coinflip_heads', style: 'primary'},
                   {type: 'buttons', text: {type: 'plain_text', text: '⚪ TAILS' }, value: JSON.stringify({ betAmount, slackId, channelId}), action_id: 'coinflip_tails'}
                ]
            }
        ]
    });
}

export async function handleCoinflipChoice(args: any) {
    const { ack,body,client,action } = args;
    await ack();

    const {betAmount, slackId, channelId } =JSON.parse(action.value);
    if (body.user.id !== slackId) return;

    const choice = action.action_id === 'coinflip_heads' ? 'HEADS' : 'TAILS';
    const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
    const won = choice === result;

    await prisma.user.update({
        where: {slackId_channelId: {slackId,channelId}},
        data: {
            balance: { increment: won ? betAmount : -betAmount},
            lastCoinflip: new Date(),
            coinflipsPlayed: { increment: 1},
            coinflipsWon: won ? {increment: 1} : undefined
        }
    });

    const user = await prisma.user.findUnique({ where: {slackId_channelId: {slackId, channelId}}});

    await client.chat.update({
        channel: channelId,
        ts: body.message.ts,
        blocks: [
            { type: 'header', text: { type: 'plain_text', text: won ? '✅ WON!' : '❌ LOST'}},
            { type: 'section', text: { type: 'mrkdwn', text: `Chose **${choice}**\nLanded **${result}**\n\n${won ? `+$${betAmount.toLocaleString()}` : `-$${betAmount.toLocaleString()}`} HC\nBalance: $${user?.balance.toLocaleString()} HC` } }
        ]
    });
    
}
