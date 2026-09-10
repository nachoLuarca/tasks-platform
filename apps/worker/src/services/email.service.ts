import nodemailer, { type Transporter } from 'nodemailer';
import {
  ACCOUNT_TOKEN_TTL_MS,
  sharedConfig,
  type EmailVerificationEmailJobData,
  type InvitationEmailJobData,
  type PasswordResetEmailJobData,
} from '@tasks-platform/shared';

let transporter: Transporter | undefined;
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: sharedConfig.smtp.host,
    port: sharedConfig.smtp.port,
    secure: sharedConfig.smtp.secure,
    auth: sharedConfig.smtp.user ? { user: sharedConfig.smtp.user, pass: sharedConfig.smtp.password } : undefined,
  });
  return transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** "24 horas" / "1 hora", from the same TTL the token was issued with, so the email can't promise a lifetime the token doesn't have. */
function describeLifetime(ttlMs: number): string {
  const hours = Math.round(ttlMs / (60 * 60 * 1000));
  return hours === 1 ? '1 hora' : `${hours} horas`;
}

function invitationText(data: InvitationEmailJobData): string {
  return [
    `${data.invitedByName} te invitó a unirte a "${data.organizationName}" en Tasks Platform como ${data.role}.`,
    '',
    `Aceptá la invitación: ${data.acceptUrl}`,
    '',
    'Si no esperabas este correo, podés ignorarlo.',
  ].join('\n');
}

function invitationHtml(data: InvitationEmailJobData): string {
  return [
    `<p>${escapeHtml(data.invitedByName)} te invitó a unirte a <strong>${escapeHtml(data.organizationName)}</strong> en Tasks Platform como <strong>${escapeHtml(data.role)}</strong>.</p>`,
    `<p><a href="${data.acceptUrl}">Aceptar invitación</a></p>`,
    '<p>Si no esperabas este correo, podés ignorarlo.</p>',
  ].join('\n');
}

/** Templates deliberately plain (no external templating dependency) -- one text, one HTML, both built from the same fields. */
export async function sendInvitationEmail(data: InvitationEmailJobData): Promise<void> {
  await getTransporter().sendMail({
    from: sharedConfig.smtp.from,
    to: data.to,
    subject: `Invitación a ${data.organizationName}`,
    text: invitationText(data),
    html: invitationHtml(data),
  });
}

function emailVerificationText(data: EmailVerificationEmailJobData): string {
  const lifetime = describeLifetime(ACCOUNT_TOKEN_TTL_MS['email-verification']);
  return [
    `Hola, ${data.name}.`,
    '',
    'Confirmá que esta dirección de correo es tuya para terminar de configurar tu cuenta de Tasks Platform:',
    data.verifyUrl,
    '',
    `El enlace vence en ${lifetime} y sirve una sola vez.`,
    '',
    'Si no creaste esta cuenta, podés ignorar este correo.',
  ].join('\n');
}

function emailVerificationHtml(data: EmailVerificationEmailJobData): string {
  const lifetime = describeLifetime(ACCOUNT_TOKEN_TTL_MS['email-verification']);
  return [
    `<p>Hola, ${escapeHtml(data.name)}.</p>`,
    '<p>Confirmá que esta dirección de correo es tuya para terminar de configurar tu cuenta de Tasks Platform.</p>',
    `<p><a href="${escapeHtml(data.verifyUrl)}">Confirmar mi correo</a></p>`,
    `<p>El enlace vence en ${lifetime} y sirve una sola vez.</p>`,
    '<p>Si no creaste esta cuenta, podés ignorar este correo.</p>',
  ].join('\n');
}

export async function sendEmailVerificationEmail(data: EmailVerificationEmailJobData): Promise<void> {
  await getTransporter().sendMail({
    from: sharedConfig.smtp.from,
    to: data.to,
    subject: 'Confirmá tu correo en Tasks Platform',
    text: emailVerificationText(data),
    html: emailVerificationHtml(data),
  });
}

function passwordResetText(data: PasswordResetEmailJobData): string {
  const lifetime = describeLifetime(ACCOUNT_TOKEN_TTL_MS['password-reset']);
  return [
    `Hola, ${data.name}.`,
    '',
    'Recibimos un pedido para restablecer la contraseña de tu cuenta de Tasks Platform. Elegí una nueva desde este enlace:',
    data.resetUrl,
    '',
    `El enlace vence en ${lifetime} y sirve una sola vez. Al usarlo se cierran todas las sesiones abiertas de tu cuenta, en todos los dispositivos.`,
    '',
    'Si no fuiste vos, ignorá este correo: tu contraseña actual sigue funcionando.',
  ].join('\n');
}

function passwordResetHtml(data: PasswordResetEmailJobData): string {
  const lifetime = describeLifetime(ACCOUNT_TOKEN_TTL_MS['password-reset']);
  return [
    `<p>Hola, ${escapeHtml(data.name)}.</p>`,
    '<p>Recibimos un pedido para restablecer la contraseña de tu cuenta de Tasks Platform.</p>',
    `<p><a href="${escapeHtml(data.resetUrl)}">Elegir una contraseña nueva</a></p>`,
    `<p>El enlace vence en ${lifetime} y sirve una sola vez. Al usarlo se cierran todas las sesiones abiertas de tu cuenta, en todos los dispositivos.</p>`,
    '<p>Si no fuiste vos, ignorá este correo: tu contraseña actual sigue funcionando.</p>',
  ].join('\n');
}

export async function sendPasswordResetEmail(data: PasswordResetEmailJobData): Promise<void> {
  await getTransporter().sendMail({
    from: sharedConfig.smtp.from,
    to: data.to,
    subject: 'Restablecé tu contraseña de Tasks Platform',
    text: passwordResetText(data),
    html: passwordResetHtml(data),
  });
}
