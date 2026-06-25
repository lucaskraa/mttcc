# mttccBookShare 2.0
Sistema interno de gestão para biblioteca escolar.
O BookShare foi reconstruído para funcionar como um sistema real, com interface responsiva, servidor Node.js no Render e banco PostgreSQL no Supabase.
O foco do aplicativo é o trabalho da bibliotecária. Os alunos não possuem conta e não entram no sistema. Eles são registros internos vinculados às turmas, aos empréstimos, às reservas e às pendências.
Arquivos entregues
```text
index.html
style.css
script.js
server.js
database.sql
package.json
README.md
```
Esta versão não inclui `.env.example` nem `.gitignore`, conforme solicitado.
As senhas e chaves não devem ser escritas em nenhum desses arquivos. Elas devem ser cadastradas diretamente no painel de variáveis do Render.
---
O que o sistema possui
Acesso e segurança
Login real conectado ao servidor.
Senhas criptografadas com bcrypt.
Sessão com JWT.
Perfil de bibliotecária.
Perfil de administrador.
Bloqueio e reativação de usuários.
Redefinição de senha pelo administrador.
Alteração da própria senha.
Limite de tentativas de login.
Proteção de cabeçalhos com Helmet.
Validação de permissão no backend.
Histórico de ações importantes.
Dashboard
Títulos cadastrados.
Total de exemplares.
Empréstimos ativos.
Empréstimos que vencem hoje.
Empréstimos próximos do vencimento.
Devoluções atrasadas.
Maior atraso atual.
Alunos ativos.
Turmas ativas.
Reservas disponíveis.
Exemplares perdidos, danificados ou em manutenção.
Gráfico de empréstimos e devoluções dos últimos 30 dias.
Lista de devoluções previstas para hoje.
Empréstimos recentes.
Livros mais procurados.
Atalhos rápidos.
Atendimento rápido
Tela feita para ser usada no balcão da biblioteca.
Permite:
pesquisar aluno por nome ou matrícula;
consultar a turma;
verificar empréstimos ativos;
verificar atrasos;
verificar reservas;
registrar novo empréstimo;
registrar devolução;
abrir o perfil completo do aluno;
criar reserva.
Alunos
Cadastro de nome completo.
Matrícula única.
Turma.
Número da chamada.
Contato do responsável.
Observações.
Arquivamento sem apagar o histórico.
Reativação do cadastro.
Perfil completo.
Empréstimos ativos.
Histórico de leitura.
Pendências.
Histórico de avisos.
Exportação em CSV.
Turmas
Nome da turma.
Turno.
Ano letivo.
Professor responsável.
Quantidade de alunos.
Empréstimos ativos da turma.
Atrasos da turma.
Visualização dos alunos.
Arquivamento e reativação.
Livros
Título.
Autor.
ISBN.
Editora.
Ano da publicação.
Categoria.
Localização na biblioteca.
Descrição.
URL da capa.
Quantidade inicial de exemplares.
Visualização em cards ou tabela.
Pesquisa e filtros.
Exportação do acervo.
Detalhes do título.
Histórico de movimentações.
Arquivamento pelo administrador.
Exemplares
Cada exemplar é controlado individualmente.
Cada um possui:
código de patrimônio automático;
livro vinculado;
data de aquisição;
observação de conservação;
situação independente.
Situações possíveis:
disponível;
emprestado;
danificado;
perdido;
em manutenção.
Empréstimos
Seleção de aluno.
Seleção de título.
Seleção automática de um exemplar disponível.
Data do empréstimo.
Data prevista para devolução.
Observações.
Limite de livros por aluno.
Bloqueio de novo empréstimo para aluno com atraso, quando configurado.
Bloqueio de empréstimo duplicado do mesmo título.
Controle de renovação.
Impedimento de renovação quando outro aluno possui reserva.
Registro de devolução normal.
Registro de livro danificado.
Registro de livro perdido.
Histórico completo.
Filtros por turma, período e situação.
Exportação em CSV.
Reservas
As reservas são registradas pela bibliotecária.
Reserva por aluno e título.
Fila por ordem de cadastro.
Posição do aluno na fila.
Status aguardando.
Status disponível para retirada.
Prazo de validade da retirada.
Status concluída.
Status cancelada.
Status expirada.
Mensagem de reserva disponível.
Conversão da reserva em empréstimo.
Liberação automática da próxima reserva quando um exemplar é devolvido.
Pendências e cobranças
Identificação automática de atraso.
Quantidade de dias atrasados.
Aluno e turma.
Livro e patrimônio.
Contato do responsável.
Modelo de mensagem configurável.
Copiar mensagem de cobrança.
Registrar canal de contato.
Registrar resultado do contato.
Registrar observações.
Histórico permanente dos avisos.
Destaque para atrasos críticos.
Relatórios
Período personalizado.
Total de empréstimos.
Total de devoluções.
Livros perdidos.
Livros danificados.
Uso da biblioteca por turma.
Preferências por categoria.
Livros mais emprestados.
Relação de exemplares perdidos ou danificados.
Exportação em CSV.
Impressão pelo navegador.
Administração
Cadastro de bibliotecárias.
Cadastro de administradores.
Bloqueio de contas.
Reativação de contas.
Redefinição de senha.
Configuração da escola.
Configuração da biblioteca.
E-mail e telefone de contato.
Ano letivo atual.
Prazo padrão de empréstimo.
Limite de livros por aluno.
Máximo de renovações.
Dias adicionados por renovação.
Aviso antes do vencimento.
Validade da reserva.
Regra de bloqueio por atraso.
Modelos de mensagens.
Responsividade
A interface foi construída para:
computador;
notebook;
tablet;
celular.
No computador:
menu lateral completo;
tabelas amplas;
dashboard em várias colunas;
busca global no topo.
No tablet:
menu lateral recolhível;
cards adaptados;
filtros reorganizados;
painéis em menos colunas.
No celular:
navegação inferior;
botão central de empréstimo;
tabelas convertidas em cards;
formulários em uma coluna;
modais abertos pela parte inferior;
botões maiores para toque;
conteúdo sem sair da tela.
---
Tecnologias
Frontend
HTML5
CSS3
JavaScript puro
Canvas para gráficos
GitHub Pages
Backend
Node.js 20 ou superior
Express
JSON Web Token
bcryptjs
Helmet
CORS
express-rate-limit
PostgreSQL com driver `pg`
Render
Banco de dados
Supabase PostgreSQL
UUID
chaves estrangeiras
índices
restrições
gatilhos de atualização
views
transações
auditoria
---
Estrutura do banco
O arquivo `database.sql` cria e atualiza:
```text
users
classes
students
categories
books
book_copies
loans
reservations
notices
settings
audit_logs
```
Também cria as views:
```text
view_books_inventory
view_active_loans
view_student_library_status
view_pending_loans
```
O SQL foi preparado para uma instalação nova e também adiciona as colunas principais caso uma versão anterior do BookShare já tenha sido executada.
---
Configurar o Supabase
1. Criar o projeto
Entre no Supabase.
Crie um novo projeto.
Guarde a senha do banco.
Aguarde a criação terminar.
2. Executar o banco
Abra o projeto.
Entre em `SQL Editor`.
Clique para criar uma consulta.
Abra o arquivo `database.sql`.
Copie todo o conteúdo.
Cole no SQL Editor.
Execute.
Ao terminar, as tabelas e categorias iniciais devem aparecer no banco.
3. Copiar a conexão
No Supabase, abra as configurações de banco e copie a connection string PostgreSQL.
Use a conexão do pooler quando ela estiver disponível.
Formato aproximado:
```text
postgresql://USUARIO:SENHA@HOST:PORTA/postgres
```
A connection string deve ser colocada apenas no Render.
Ela nunca deve aparecer em:
`index.html`;
`style.css`;
`script.js`;
`README.md` publicado;
código visível do GitHub.
---
Configurar o GitHub
Envie estes arquivos para a raiz do repositório:
```text
index.html
style.css
script.js
server.js
database.sql
package.json
README.md
```
Não envie senhas, conexão do banco nem JWT dentro dos arquivos.
GitHub Pages
Abra o repositório.
Entre em `Settings`.
Abra `Pages`.
Em `Build and deployment`, selecione `Deploy from a branch`.
Escolha a branch `main`.
Escolha a pasta `/root`.
Salve.
O endereço ficará parecido com:
```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```
---
Configurar o Render
1. Criar o serviço
Abra o Render.
Clique em `New`.
Escolha `Web Service`.
Conecte o repositório do BookShare.
Use Node como ambiente.
2. Comandos
```text
Build Command: npm install
Start Command: npm start
```
3. Variáveis do Render
Cadastre diretamente em `Environment`:
```text
NODE_ENV=production
DATABASE_URL=connection_string_do_supabase
JWT_SECRET=uma_chave_grande_aleatoria
FRONTEND_URL=https://SEU-USUARIO.github.io
ADMIN_NAME=Administrador BookShare
ADMIN_EMAIL=admin@escola.com
ADMIN_PASSWORD=uma_senha_forte
```
DATABASE_URL
É a conexão PostgreSQL copiada do Supabase.
JWT_SECRET
Use uma chave longa e difícil de adivinhar, com pelo menos 24 caracteres.
Exemplo de formato, sem copiar literalmente:
```text
bookshare_chave_muito_grande_2026_aleatoria
```
FRONTEND_URL
Use somente a origem do GitHub Pages, sem o nome do repositório e sem barra no final.
Exemplo:
```text
https://mtuzinho1.github.io
```
Para permitir mais de uma origem, separe por vírgula:
```text
https://usuario.github.io,https://outro-dominio.com
```
ADMIN_EMAIL e ADMIN_PASSWORD
O servidor cria automaticamente a primeira conta de administrador quando ainda não existe uma conta com esse e-mail.
Depois do primeiro acesso, a senha pode ser alterada dentro do sistema.
4. Testar o servidor
Depois do deploy, abra:
```text
https://SEU-SERVIDOR.onrender.com/api/health
```
A resposta deve mostrar:
```json
{
  "status": "ok",
  "database": "connected"
}
```
---
Conectar o frontend ao Render
Abra `script.js` e localize:
```javascript
const CONFIG = {
  API_BASE_URL: "https://SEU-SERVIDOR.onrender.com/api",
  TOKEN_KEY: "bookshare_token",
  REQUEST_TIMEOUT: 25000,
  SEARCH_DELAY: 260
};
```
Troque apenas a URL:
```javascript
API_BASE_URL: "https://nome-do-servico.onrender.com/api"
```
Não use localhost na versão publicada.
---
Primeiro acesso
Use:
```text
E-mail: valor de ADMIN_EMAIL no Render
Senha: valor de ADMIN_PASSWORD no Render
```
Após entrar:
Abra Configurações.
Informe o nome da escola.
Informe o nome da biblioteca.
Revise os prazos.
Cadastre as turmas.
Cadastre os alunos.
Cadastre os livros.
Crie contas para as bibliotecárias.
Comece os empréstimos.
---
Ordem ideal de uso
Preparação inicial
Configurações.
Turmas.
Alunos.
Livros e exemplares.
Usuários.
Rotina diária
Atendimento rápido.
Novo empréstimo.
Devolução.
Reservas.
Pendências.
Relatórios.
---
Regras importantes
Novo empréstimo
O servidor verifica:
se o aluno existe;
se o aluno está ativo;
se o livro existe;
se existe exemplar disponível;
se o aluno está atrasado;
se a biblioteca bloqueia alunos atrasados;
se o aluno atingiu o limite de livros;
se ele já está com o mesmo título;
se a data de devolução é válida.
Renovação
O servidor verifica:
se o empréstimo está ativo;
se o limite de renovações foi atingido;
se outro aluno possui reserva do título.
Devolução
Quando a devolução é normal:
o empréstimo é finalizado;
o exemplar volta a ficar disponível;
a primeira reserva da fila pode ser liberada automaticamente.
Quando o livro está danificado:
o empréstimo é finalizado;
o exemplar fica como danificado;
ele não volta para os empréstimos até sua situação ser alterada.
Quando o livro foi perdido:
o empréstimo é finalizado;
o exemplar fica como perdido;
a perda aparece nos relatórios.
---
Testes recomendados
Antes de apresentar, teste:
Login
administrador correto;
senha errada;
usuário bloqueado;
logout;
sessão expirada.
Cadastros
turma duplicada;
matrícula duplicada;
ISBN duplicado;
livro com mais de um exemplar;
edição;
arquivamento.
Empréstimos
empréstimo normal;
aluno no limite;
aluno atrasado;
título sem exemplar;
empréstimo duplicado;
renovação;
devolução normal;
devolução danificada;
livro perdido.
Reservas
reserva duplicada;
posição na fila;
livro disponível;
mensagem de retirada;
conversão em empréstimo;
cancelamento;
expiração.
Responsividade
computador da escola;
celular Android;
modo responsivo do navegador;
tablet ou simulação de tablet;
orientação vertical e horizontal.
---
Problemas comuns
Site abre, mas não carrega dados
Confira o endereço em `API_BASE_URL` dentro de `script.js`.
Teste o endpoint:
```text
https://SEU-SERVIDOR.onrender.com/api/health
```
Erro de CORS
Confira `FRONTEND_URL` no Render.
Use a origem do GitHub Pages:
```text
https://SEU-USUARIO.github.io
```
Não coloque o nome do repositório nessa variável.
Erro de banco
Confira:
`DATABASE_URL`;
senha do banco;
connection string do pooler;
execução completa do `database.sql`;
logs do Render.
Administrador não foi criado
Confira no Render:
```text
ADMIN_NAME
ADMIN_EMAIL
ADMIN_PASSWORD
```
A senha deve possuir pelo menos oito caracteres.
Depois de alterar as variáveis, faça um novo deploy ou reinicie o serviço.
Login retorna erro interno
Veja os logs do Render e confirme se:
o banco está conectado;
a tabela `users` existe;
`JWT_SECRET` possui pelo menos 24 caracteres;
o SQL foi executado.
Livro não pode ser arquivado
O livro possui empréstimo ativo. Registre a devolução antes.
Aluno não pode ser arquivado
O aluno possui empréstimo ativo. Finalize os empréstimos antes.
---
Segurança
Mesmo sem os arquivos `.env.example` e `.gitignore`, mantenha estas regras:
não escreva senhas reais nos códigos;
não escreva `DATABASE_URL` no GitHub;
não escreva `JWT_SECRET` no GitHub;
configure tudo pelo painel do Render;
use senha forte para o administrador;
não compartilhe a senha do Supabase;
não coloque conexão do banco no frontend;
não faça o frontend acessar o Supabase diretamente com credenciais administrativas.
O frontend acessa apenas a API do Render.
O Render acessa o Supabase.
```text
GitHub Pages → Render → Supabase PostgreSQL
```
---
Verificação dos arquivos
Para verificar a sintaxe pelo terminal, depois de instalar as dependências:
```bash
npm install
npm run check
```
Para iniciar:
```bash
npm start
```
O servidor usa a porta enviada pelo Render por meio de `PORT`.
---
Versão
```text
BookShare 2.0
```
Esta versão substitui a primeira base simples e amplia o sistema para uma solução de biblioteca escolar com circulação, reservas, pendências, relatórios, auditoria e administração.
