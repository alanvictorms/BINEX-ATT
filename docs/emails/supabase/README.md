# E-mails do Supabase Auth

Os e-mails de **autenticação** (confirmação de cadastro, recuperação de senha)
saem do Supabase, não do app — não passam pelo Resend nem pelo
`frontend/src/lib/email.ts`. O corpo deles mora no painel, em
**Authentication → Emails**, e este diretório guarda uma cópia do que está
colado lá, pra mudança de marca não depender de alguém lembrar de abrir o painel.

| Arquivo | Template no painel |
|---|---|
| `confirm-signup.html` | Confirm sign up |

## Confirm sign up

O template de fábrica manda `{{ .ConfirmationURL }}` (um link). A tela de
cadastro do app espera um **código de 6 dígitos** (`OtpInput` em
`frontend/src/app/login/page.tsx`), então o corpo precisa conter `{{ .Token }}`
— com o link, a tela do código fica esperando algo que nunca chega.

Assunto:

```
Seu código de confirmação: {{ .Token }}
```

Corpo: conteúdo de `confirm-signup.html`, colado na aba **Source**.

## Configuração que acompanha

- **Authentication → Emails → SMTP**: servidor da Hostinger
  (`smtp.hostinger.com`, porta `465`, SSL/TLS), remetente
  `noreply@verticebroker.co`. Sem SMTP próprio, o Supabase usa o serviço
  embutido — limitado a poucos e-mails por hora e só para membros do projeto,
  o que na prática significa cadastro travado para usuário real.
- **Authentication → Sessions/Providers → Email OTP Expiration**: 3600s (1 hora)
  é o que o texto do e-mail promete. Mudou lá, muda aqui.
- O reenvio tem limite de frequência do lado do Supabase; a tela ainda segura o
  botão por 60s para o usuário não descobrir isso levando erro.
