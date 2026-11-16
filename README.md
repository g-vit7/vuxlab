# Vuxlab

MVP para mapear e gerenciar laboratórios e outros espaços, em português brasileiro.
React + Vite + TypeScript, Tailwind CSS, componentes no padrão shadcn/ui com Radix, Lucide, React Router, Zod e Supabase. Hospedagem preparada para Vercel. Sem Next.js, React Flow ou servidor Node próprio.

## Executar em três passos

Requer Node.js 22.12+ (validado com Node 24) e npm.

```bash
npm ci
npm run dev
```

Abra a URL mostrada pelo Vite. Sem variáveis de ambiente, clique em **Explorar demonstração**. A demonstração tem dados fictícios, operações reais de edição e persistência em `localStorage`. Convites, autenticação e gestão de outros usuários exigem Supabase. A demonstração é um ambiente separado e não simula segurança de acesso.

## Conectar Supabase

1. Crie um projeto Supabase de desenvolvimento.
2. Execute `supabase/migrations/202611160001_core.sql` no SQL Editor de um banco novo. Alternativamente, use o CLI oficial:

   ```bash
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

3. Copie `.env.example` para `.env.local` e preencha somente:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON_OU_PUBLISHABLE
   ```

4. Em Authentication → URL Configuration, configure o Site URL e permita `http://localhost:5173`, `http://localhost:5173/conta` e os equivalentes HTTPS do domínio de publicação. Cadastro redireciona à origem; recuperação de senha redireciona a `/conta`.
5. Mantenha confirmação de e-mail habilitada. Configure SMTP para entregabilidade e limites de envio antes dos testes com professores. Ajuste o limite de linhas da Data API para pelo menos 10000, como no `supabase/config.toml`, para grades grandes.
6. Reinicie o Vite. Cadastre usuários, confirme o e-mail e crie um Workspace. O criador é administrador.

**Nunca coloque `service_role`, chave secreta ou senha do banco em variáveis `VITE_*`.** Elas entram no pacote público do navegador. A autorização depende de RLS e RPCs, não de esconder a chave pública.

Para Supabase local, com Docker e CLI oficial instalados, execute `supabase start` e `supabase db reset`, copie URL/chave pública mostradas pelo CLI para `.env.local` e configure os usuários de teste. O arquivo de configuração local já acompanha o projeto.

## Usar o editor

- Crie uma sala entre 1 × 1 e 100 × 100 células. O limite é 2000 objetos por sala, 100 atributos por objeto.
- Selecione PC, PC mestre, porta ou outro na barra e clique numa célula vazia. Coordenadas começam em (1,1), X à direita e Y abaixo.
- Arraste objetos para células vazias. Com teclado ou celular, selecione o objeto, use **Mover para outra célula** e escolha o destino. Todas as células podem receber foco e são acionadas com Enter/Espaço.
- Para excluir um computador, selecione-o no mapa e clique em **Excluir computador** no rodapé fixo do painel. A exclusão pede confirmação. **Mover** também fica nesse rodapé. No celular, o painel recolhe durante a escolha de destino e pode ser reaberto ao cancelar a movimentação.
- No painel, edite identificador, IP, utilizadores, notas compartilhadas, ícone e cor. Há dez ícones Lucide selecionáveis; outros nomes importados são preservados, mas usam engrenagem quando não estão no catálogo.
- Listas têm campos próprios: utilizadores usam nome/turma e notas usam textos. Listas complexas importadas com estruturas aninhadas são preservadas e exibidas sem edição interna.
- Texto salva após 650 ms sem digitação; estrutura salva imediatamente. **Salvar** antecipa o envio pendente. A fila usa versões para evitar sobrescrever alterações concorrentes. Em erro, recarregue explicitamente; a aplicação não repete uma gravação sobre uma versão nova.
- **Dimensões** oferece quatro âncoras e uma revisão dos objetos afetados antes de confirmar exclusões. A transação salva a alteração e seu histórico juntas.
- Minhas notas estão disponíveis no Workspace e no editor, com vínculo ao Workspace, sala ou objeto. Somente o autor com acesso ao elemento pode consultá-las.
- Administradores gerenciam membros e convites em **Membros e convites**. Copie o link ao criar: apenas o hash é guardado e o token não pode ser recuperado posteriormente.
- **Histórico** permite inspecionar os estados compartilhados e reverter operações. Uma reversão só é aceita quando nenhuma operação posterior alterou aquela sala. A reversão recebe nova versão e nova entrada de histórico. É possível desfazer a própria reversão.
- Excluir uma sala ou objeto remove suas notas particulares vinculadas. O histórico restaura apenas estrutura e atributos compartilhados; notas particulares excluídas não são restauradas. As confirmações explicam esse comportamento.
- **Exportar** usa os atributos autorizados presentes na resposta do banco, nunca notas particulares. **Importar JSON** valida tamanho, tipos, limites, identificadores e sobreposição; cria sala, objetos e atributos com IDs novos, sob propriedade do importador.

## Papéis aplicados no banco

| Operação                                      | Público        | Docente                    | Administrador |
| --------------------------------------------- | -------------- | -------------------------- | ------------- |
| Ler salas e atributos públicos                | Sim, se membro | Sim                        | Sim           |
| Ler atributos docente/administrativo          | Não            | Sim                        | Sim           |
| Editar atributo docente                       | Não            | Sim                        | Sim           |
| Editar atributo administrativo                | Não            | Somente em sala própria    | Sim           |
| Criar sala                                    | Não            | Sim, torna-se proprietário | Sim           |
| Editar layout, permissões e atributos de sala | Não            | Sala própria               | Todas         |
| Administrar membros/convites                  | Não            | Não                        | Sim           |
| Ler notas particulares de terceiros           | Não            | Não                        | Não           |

“Público” é um papel de membro, não uma sala exposta à internet. Não há Workspaces anônimos.

Todos os writes estruturais passam por RPCs com `security definer`, `search_path` fixo, identidade e permissões explícitas. Tabelas compartilhadas não têm grants de escrita para o frontend. Helpers privados que alteram dados não são executáveis por usuários autenticados. RLS filtra leituras por Workspace e visibilidade dos atributos; notas usam políticas de autor e escopo. Histórico é somente leitura, exclusivo a docentes/administradores, e não contém notas privadas. A RLS protege contra usuários da aplicação; não contra o proprietário técnico do banco e suas credenciais privilegiadas.

Convites usam tokens aleatórios de 64 caracteres hexadecimais com dois UUIDs v4, hash SHA-256, bloqueio transacional, expiração, papel gravado no banco e contador de usos. Aceitar convite preserva papel de membro existente. O último administrador não pode ser removido/rebaixado.

As operações de sala usam bloqueio no Workspace para manter ordem transacional e versão por sala. Este desenho favorece simplicidade e consistência no MVP; não é um editor de alta concorrência em tempo real.

## Testes

```bash
npm test              # geometria, importação e permissões do modelo
npm run test:db       # PostgreSQL real em WASM: migration, grants, RLS e RPCs
npm run build         # TypeScript e bundle de produção
```

`test:db` usa PGlite, com uma implementação mínima de `auth.users`/`auth.uid()` para trocar a identidade SQL. Exercita diretamente PostgreSQL/RLS e não mocks da interface. Não testa a infraestrutura hospedada, o envio de e-mail, os JWTs reais ou PostgREST.

Para o teste **diretamente contra um Supabase real**, crie três usuários distintos e confirmados em projeto exclusivo de testes e configure no ambiente de terminal (fora do bundle):

```dotenv
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
TEST_ADMIN_EMAIL=...
TEST_ADMIN_PASSWORD=...
TEST_TEACHER_EMAIL=...
TEST_TEACHER_PASSWORD=...
TEST_PUBLIC_EMAIL=...
TEST_PUBLIC_PASSWORD=...
```

```bash
node --env-file=.env.local tests/supabase.mjs
```

A suíte cria um Workspace com usuários e sala de teste, verifica isolamento, convites, filtros de atributos, notas privadas, imutabilidade do histórico e retomada de sessão pela API real. Não usa service-role. O ID do Workspace é impresso para auditoria; depois, exclua a fixture no SQL Editor do projeto de teste. Não execute em produção. O teste de cadastro e confirmação por e-mail deve ser realizado manualmente: cadastro → e-mail de confirmação → login → sair → recuperação → nova senha.

Checklist manual adicional: testar 390 px de largura, tema escuro, navegação por teclado, arrastar, mover sem arrastar, redimensionar com exclusão, importar arquivo inválido, recarregar e editar a mesma sala simultaneamente em duas contas. Espera-se erro explícito de conflito na segunda gravação, sem overwrite silencioso.

## GitHub e Vercel

O código não foi enviado a uma conta externa. Crie um repositório **privado vazio** no GitHub e envie a pasta extraída, sem `node_modules`, `.env.local` ou `dist`:

```bash
git init
git add .
git commit -m "Implementa MVP inicial do Vuxlab"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

A automação `.github/workflows/ci.yml` executa os testes locais e o build a cada push/PR. O teste Supabase real usa contas próprias e é executado separadamente.

Na Vercel:

1. Importe o repositório, selecione o preset **Vite** e a pasta que contém `package.json`.
2. Build: `npm run build`. Output: `dist`. Instalação: `npm ci`. Node: 22 ou 24.
3. Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nos ambientes desejados.
4. Publique. `vercel.json` encaminha deep links para `index.html` e define headers básicos.
5. Inclua o domínio HTTPS em Supabase Authentication → URL Configuration. Evite permitir domínios de preview arbitrários na configuração de produção.
6. Teste cadastro/login/recuperação no domínio final e execute a suíte Supabase no projeto de homologação.

Nenhuma conta Supabase, GitHub ou Vercel foi criada nem publicação externa foi realizada nesta entrega. Veja `docs/ENTREGA.md` para validações e limites concretos.

## Organização

- `src/App.tsx`: autenticação, rotas, Workspaces, salas, membros, convites e conta.
- `src/features/editor/Editor.tsx`: grade, atributos, notas, resize e histórico.
- `src/components/ui/`: Button e Dialog com Radix/CVA, no padrão shadcn/ui.
- `src/components/WorkspaceNotes.tsx`: notas privadas de Workspace.
- `src/lib/model.ts`: tipos, regras de geometria e schemas Zod.
- `src/lib/api.ts`: consultas Supabase e RPCs.
- `src/lib/demo.ts`: armazenamento demonstrativo separado.
- `supabase/migrations/`: schema, RLS e funções SQL.
- `tests/`: modelo, banco local e integração Supabase real.

Referências técnicas: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções SQL](https://supabase.com/docs/guides/database/functions), [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## Atualização: salas compactas, perfil e notas gerais

Em Minha conta, o campo Nome de usuário altera o nome de exibição salvo em profiles. Ele não é um identificador único nem muda o e-mail usado para entrar. O nome aparece na barra lateral e na lista de membros consultada por administradores.

O novo atalho Minhas notas, acima de Minha conta e Sair, reúne as notas particulares dos Workspaces, salas e objetos aos quais o autor ainda tem acesso. Permite buscar pelo texto ou local, filtrar por Workspace, criar, editar e excluir notas. Ao criar, escolha o Workspace e opcionalmente a sala e o objeto. Notas continuam vinculadas a um elemento; não há notas avulsas fora dos Workspaces. A visibilidade continua sendo aplicada por RLS no banco.

Cartões de sala têm altura uniforme de 108 px com miniatura simplificada do mapa, nome, dimensões e contagem de objetos. Busca e Importar JSON têm 40 px de altura; o campo nativo de arquivo não aparece como controle adicional.

Para atualizar uma instalação que já aplicou a migration inicial e a atualização Vitest 5.1.0, basta substituir a pasta src pela pasta src deste pacote. Preserve .env.local e a instalação existente. Não execute novamente o SQL inicial: esta atualização não tem migration, biblioteca nova ou mudança de credenciais. Reinicie o servidor se necessário e atualize a página.
