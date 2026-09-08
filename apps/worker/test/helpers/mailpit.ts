const MAILPIT_API = 'http://localhost:8025/api/v1';

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
}

interface MailpitMessageDetail {
  Subject: string;
  Text: string;
  HTML: string;
}

/** Empties the real Mailpit inbox (docker-compose's `mailpit` service) so each test starts from a known state. */
export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}

/** Polls the real Mailpit API -- not a mock SMTP transport -- until a message addressed to `email` shows up, then returns its content. */
export async function findMailpitMessageTo(email: string, timeoutMs = 8000): Promise<MailpitMessageDetail> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const listResponse = await fetch(`${MAILPIT_API}/messages`);
    const list = (await listResponse.json()) as { messages: MailpitMessageSummary[] };
    const match = list.messages.find((message) => message.To.some((to) => to.Address === email));

    if (match) {
      const detailResponse = await fetch(`${MAILPIT_API}/message/${match.ID}`);
      return (await detailResponse.json()) as MailpitMessageDetail;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`No Mailpit message found for ${email} within ${timeoutMs}ms -- is the mailpit container running?`);
}
