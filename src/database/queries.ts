import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getOrCreateUser(
    slackId: string,
    username: string,
    channelId: string
) {
    let user = await prisma.user.findUnique({
        where: {
            slackId_channelId: { slackId, channelId }
        }
    });

    if (!user) user =await prisma.user.create({
        data: {
            slackId,
            username,
            channelId,
            balance: 100
        }
    });

    return user;
}

export async function updateBalance(
    slackId: string,
    channelId: string,
    amount: number
) {
    const updates: any = {
        balance: { increment: amount }
    };

    if (amount > 0) {
        updates.totalEarned = { increment: amount };
    }
    
    
    return await prisma.user.update({
        where: {
            slackId_channelId: { slackId, channelId }
        },
        data: updates  
    });
}

export async function canWork(
    slackId: string,
    channelId: string,
    cooldownMinutes: number
): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: {
            slackId_channelId: { slackId, channelId }
        }
    });

    if (!user || !user.lastWork) return true;

    const now = new Date();
    const diffMinutes = (now.getTime() - user.lastWork.getTime())/1000/60;

    return diffMinutes >= cooldownMinutes;
}

export { prisma };