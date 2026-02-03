export function formatTimeUntil(resetTime: string | number | null): string {
    if (!resetTime) return "";

    let resetDate: Date;

    if (typeof resetTime === 'number') {
        resetDate = new Date(resetTime * 1000);
    } else {
        resetDate = new Date(resetTime);
    }

    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs <= 0) return "now";

    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
        const hours = diffHours % 24;
        return hours > 0 ? `${diffDays}d ${hours}h` : `${diffDays}d`;
    }

    if (diffHours > 0) {
        const minutes = diffMinutes % 60;
        return minutes > 0 ? `${diffHours}h ${minutes}m` : `${diffHours}h`;
    }

    return `${diffMinutes}m`;
}
