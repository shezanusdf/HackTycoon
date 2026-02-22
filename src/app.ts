import { App } from '@slack/bolt';
import dotenv from 'dotenv';
import { handleWork } from './commands/work';
import { handleBalance } from './commands/balance';
import { handlePitch } from './commands/pitch';
import { handleShop, handleShopPurchase } from './commands/shop';
import { handleDeposit, handleWithdraw, handleDepositSubmit, handleWithdrawSubmit } from './commands/banking';
import { handleRob } from './commands/rob';
import { handleCoinflip, handleCoinflipChoice, handleChallengeResponse } from './commands/coinflip';
import { handleDaily } from './commands/daily';
import { handleLeaderboard } from './commands/leaderboard';


dotenv.config()

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

// slack commands
app.command('/work', handleWork);
app.command('/bal', handleBalance);
app.command('/pitch', handlePitch);
app.command('/shop', handleShop);
app.command('/rob', handleRob);
app.command('/coinflip', handleCoinflip);
app.command('/daily', handleDaily);
app.command('/leaderboard', handleLeaderboard);

app.command('/help', async ({ command, ack, say }) => {
  await ack();
  await say({
    text: '🎮 *Hack Tycoon Commands*\n\n' +
          '💼 *Economy*\n' +
          '`/work` - Grind and earn HC\n' +
          '`/bal` - Check your balance\n' +
          '`/daily` - Claim daily bonus (streak rewards!)\n' +
          '`/shop` - Browse items\n\n' +
          '🎲 *Gambling*\n' +
          '`/pitch <amount>` - Spin the slots\n' +
          '`/coinflip <amount>` - 50/50 solo gamble\n' +
          '`/coinflip @user <amount>` - Challenge someone!\n\n' +
          '💀 *Crime*\n' +
          '`/rob @user <amount>` - Steal from others (risky!)\n\n' +
          '🏆 *Social*\n' +
          '`/leaderboard` - Top 10 richest players'
  });
});

app.action('deposit_money', handleDeposit);
app.action('withdraw_money', handleWithdraw);

app.action(/^buy_.*/, handleShopPurchase);

app.action('coinflip_heads', handleCoinflipChoice);
app.action('coinflip_tails', handleCoinflipChoice);
app.action('challenge_accept', handleChallengeResponse);
app.action('challenge_decline', handleChallengeResponse);

app.view('deposit_modal', handleDepositSubmit);
app.view('withdraw_modal', handleWithdrawSubmit);

(async () => {
    await app.start();
    console.log('Hack Tycoon is running!')
})();