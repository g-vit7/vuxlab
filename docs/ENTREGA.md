# Entrega inicial — Vuxlab 0.1.0

Data: 16/11/2026.

Código executável com demonstração local e integração Supabase implementada. A aprovação para uso com dados reais depende de configurar o projeto externo e executar a homologação descrita abaixo.

## Funcionalidades implementadas

| Área | Entrega |
|---|---|
| Stack | React/Vite/TypeScript, Tailwind, Radix/shadcn, Lucide, Router, Supabase SDK e Zod |
| Conta | Cadastro, login/logout, recuperação e alteração de senha; sessão persistente via SDK |
| Workspace | Criar, listar e renomear; participação múltipla e papéis por Workspace |
| Membros | Listagem de identidades somente por RPC administrativa, troca de papel e remoção; proteção do último administrador |
| Convites | Link aleatório, hash SHA-256, validade, limite de usos, revogação e consumo atômico |
| Salas | Criar, renomear, excluir e importar sob propriedade do usuário |
| Mapa | CSS Grid, coordenadas desde (1,1), objetos, seleção, zoom e rolagem |
| Movimentação | Arrastar/soltar e alternativa por seleção de destino, sem sobreposição |
| Atributos | Texto, número, booleano e listas; valores JSONB individuais, visibilidade/edição independentes |
| Propriedade | Docente pode gerenciar integralmente sua sala, sem administrar membros |
| Notas | Particulares no Workspace, sala e objeto, com RLS de autor e acesso ao escopo |
| Salvamento | Debounce de 650 ms, operações estruturais imediatas, fila, botão manual e feedback |
| Redimensionamento | Quatro âncoras, lista de objetos afetados, confirmação e transação com histórico |
| Histórico | Estados compartilhados antes/depois, autor, horário, reversão autorizada e conflito por versão |
| JSON | Exportação dos atributos autorizados; importação validada com novos IDs |
| Interface | Português brasileiro, claro/escuro, layout responsivo, painel móvel, estados vazios/erro/carregamento |
| Deploy | `.env.example`, lockfile, configuração Vercel, migration e workflow GitHub Actions |

## Validação executada

- `npm run build`: aprovado, TypeScript e bundle de produção. Avisos informativos de anotações de otimização do Zod, sem falha de build.
- `npm test`: 9 testes aprovados, incluindo quatro âncoras, importação inválida e exceção de proprietário.
- `npm run test:db`: 25 cenários aprovados diretamente em PostgreSQL/PGlite com grants, RLS e RPCs. Incluem isolamento, restrição por atributo, notas privadas, acesso após remoção de membro, imutabilidade do histórico, convites, conflitos, confirmação nula, versão nula, IDs duplicados e tentativa de explorar rótulo de histórico forjado.
- Navegador desktop: login visual/demonstração, navegação entre Workspace/sala, seleção, edição de identificador, salvamento manual/automático, manutenção de edição após recarregar, movimentação sem arrastar, histórico e reversão. O mapa retornou à disposição demonstrativa original após os testes.

## Não validado externamente

- Não houve conexão com um projeto Supabase real: cadastro/confirmar e-mail/SMTP, recuperação, JWTs e PostgREST ainda precisam ser verificados. `tests/supabase.mjs` está pronto para três contas de homologação.
- Não houve criação/push de repositório GitHub nem deploy Vercel. O README contém os passos para ambos.
- Layout mobile, leitores de tela, drag-and-drop nativo e uso concorrente em dois navegadores ainda precisam de homologação manual. A proteção de concorrência e a alternativa ao drag foram verificadas em SQL e/ou desktop conforme acima.

## Decisões e limites conhecidos

- O modo demo é separado e exclusivo ao navegador. Não implementa sessões reais, convites reais nem múltiplos usuários locais.
- Notas particulares não entram em histórico/exportações. Ao excluir seu elemento, são apagadas; reverter estrutura não as restaura. Confirmações avisam essa perda.
- Desfazer é conservador: exige que a sala ainda corresponda ao resultado da operação, sem versões posteriores. Não faz merge seletivo de alterações independentes. Reversões também são reversíveis.
- O histórico cobre salas, objetos e atributos compartilhados. Configurações de conta, notas privadas, membros e convites não têm histórico reversível nesta versão.
- Não há atualização em tempo real. Outro usuário vê mudanças ao recarregar; uma edição desatualizada recebe erro, sem sobrescrita silenciosa.
- Uma transação de mapa bloqueia seu Workspace. Isso reduz paralelismo entre salas, adequado ao primeiro MVP.
- As listas usuais têm formulários de nome/turma e textos. Conteúdo aninhado arbitrário importado é preservado, mas a edição interna desse formato não faz parte do formulário inicial.
- Catálogo inicial de dez ícones Lucide; nomes importados fora dele usam engrenagem como fallback.
- Grade limitada a 100 × 100, 2000 objetos, 100 atributos por objeto e importação de até 2 MB. Não há virtualização da grade.
- Consultas de lista ficam sujeitas ao limite de linhas configurado na Data API. Configure pelo menos 10000 linhas para o tamanho máximo de sala; paginação e virtualização devem ser tratadas antes de escalar para milhares de salas.
- Snapshots completos deixam o histórico simples e consistente, mas aumentam armazenamento; não há política de retenção automática.
- O frontend não possui fila offline durável para contas reais. Em falha de rede, apresenta erro e exige revisão/recarregamento.
- Privacidade é aplicada entre usuários da aplicação. Administradores técnicos do projeto Supabase com acesso privilegiado ao banco continuam fora dessa fronteira.

## Próxima etapa concreta

Conectar um repositório privado e um projeto Supabase de homologação; aplicar a migration; configurar chaves públicas/redirects; executar `test:supabase` e o ciclo de cadastro/recuperação; publicar na Vercel; validar os três papéis com professores em dados fictícios antes de cadastrar dados reais.

## Correção de layout — 16/11/2026

Removida a altura mínima de 650 px que excedia telas menores. O editor ocupa a altura disponível abaixo do cabeçalho; mapa e atributos têm rolagens próprias. Cabeçalho, abas e ações do painel permanecem fora da área rolável. A navegação esquerda passa a oferecer rolagem e esconde o cartão decorativo em janelas baixas. Mover e Excluir computador/porta/objeto ficam em um rodapé fixo, com confirmação antes da exclusão. No celular, iniciar uma movimentação recolhe o painel para liberar o mapa, com opção explícita de cancelar.

Verificado no navegador em áreas de 1280 × 600 e 390 × 680, além do build de produção. Esta correção não altera dependências, banco ou dados salvos.

## Correção de dependências — 16/11/2026

Vitest atualizado de 3.2.7 para 5.1.0, fixado em package.json e package-lock.json. A atualização remove a cadeia antiga de tinypool e atualiza @vitest/mocker. Após a mudança: npm test com 9 testes aprovados, npm run build aprovado e npm audit com zero vulnerabilidades no momento da verificação. Não foram necessárias alterações nos testes ou no código da aplicação.

Para aplicar a correção em uma instalação existente, interrompa o servidor e execute npm install --save-dev --save-exact vitest@5.1.0, seguido de npm test, npm run build e npm audit (no PowerShell, use npm.cmd). Não é necessário npm audit fix --force.

## Atualização de interface, perfis e notas — 16/11/2026

- Busca de salas e Importar JSON alinhados com altura de 40 px, sem campo nativo de arquivo visível.
- Cartões compactos com altura uniforme de 108 px e miniatura simplificada, nome, dimensões e contagem de objetos.
- Nome de exibição editável em Minha conta, persistido no perfil, com atualização imediata da identificação na barra lateral.
- Atalho geral Minhas notas acima de Minha conta/Sair: lista de todas as notas autorizadas do autor, busca, filtro por Workspace, criação com vínculo a Workspace/sala/objeto e edição/exclusão.
- Sem novas dependências ou migrations SQL. A tabela profiles e as políticas de private_notes existentes atendem aos novos fluxos.

Verificações: build de produção aprovado; 9 testes de modelo aprovados; 26 cenários SQL/RLS aprovados, incluindo novo cenário de isolamento e alteração do próprio perfil. No navegador em demonstração: alteração do nome e recarregamento, criação/edição de nota de sala pela listagem geral, persistência após recarregar, filtro de salas, igualdade de altura dos controles e ocultação do input de arquivo. Tela de notas verificada em 390 × 680 sem overflow horizontal. Não foram usados dados reais nem efetuadas mudanças no projeto Supabase do usuário.
