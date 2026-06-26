BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'user_role'
  ) THEN
    CREATE TYPE user_role AS ENUM (
      'admin',
      'librarian'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'copy_status'
  ) THEN
    CREATE TYPE copy_status AS ENUM (
      'available',
      'loaned',
      'damaged',
      'lost',
      'maintenance'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'loan_status'
  ) THEN
    CREATE TYPE loan_status AS ENUM (
      'active',
      'returned',
      'damaged',
      'lost'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'return_condition'
  ) THEN
    CREATE TYPE return_condition AS ENUM (
      'normal',
      'damaged',
      'lost'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'reservation_status'
  ) THEN
    CREATE TYPE reservation_status AS ENUM (
      'active',
      'ready',
      'completed',
      'cancelled',
      'expired'
    );
  END IF;
END
$$;



CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'librarian',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_lowercase
    CHECK (email = LOWER(email))
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_plain_unique
  ON users (email);

CREATE INDEX IF NOT EXISTS users_role_idx
  ON users (role);

CREATE INDEX IF NOT EXISTS users_active_idx
  ON users (active);

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL,
  shift VARCHAR(30) NOT NULL,
  school_year INTEGER NOT NULL,
  teacher_name VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT classes_school_year_check
    CHECK (school_year BETWEEN 2020 AND 2100),

  CONSTRAINT classes_shift_check
    CHECK (shift IN ('Manhã', 'Tarde', 'Noite', 'Integral')),

  CONSTRAINT classes_unique
    UNIQUE (name, shift, school_year)
);

CREATE INDEX IF NOT EXISTS classes_active_idx
  ON classes (active);

CREATE INDEX IF NOT EXISTS classes_school_year_idx
  ON classes (school_year DESC);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  registration_number VARCHAR(40) NOT NULL UNIQUE,
  class_id UUID NOT NULL,
  roll_number INTEGER,
  guardian_contact VARCHAR(80),
  photo_url TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT students_class_id_fk
    FOREIGN KEY (class_id)
    REFERENCES classes (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT students_roll_number_check
    CHECK (
      roll_number IS NULL
      OR roll_number BETWEEN 1 AND 99
    )
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE INDEX IF NOT EXISTS students_class_id_idx
  ON students (class_id);

CREATE INDEX IF NOT EXISTS students_active_idx
  ON students (active);

CREATE INDEX IF NOT EXISTS students_full_name_idx
  ON students (LOWER(full_name));

CREATE INDEX IF NOT EXISTS students_registration_number_idx
  ON students (registration_number);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(90) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS categories_active_idx
  ON categories (active);

CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  author VARCHAR(160) NOT NULL,
  isbn VARCHAR(30),
  publisher VARCHAR(120),
  publication_year INTEGER,
  category_id UUID,
  shelf VARCHAR(80),
  description TEXT,
  cover_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT books_category_id_fk
    FOREIGN KEY (category_id)
    REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT books_year_check
    CHECK (
      publication_year IS NULL
      OR publication_year BETWEEN 1000 AND 2100
    ),

  CONSTRAINT books_isbn_unique
    UNIQUE (isbn)
);

CREATE INDEX IF NOT EXISTS books_title_idx
  ON books (LOWER(title));

CREATE INDEX IF NOT EXISTS books_author_idx
  ON books (LOWER(author));

CREATE INDEX IF NOT EXISTS books_category_id_idx
  ON books (category_id);

CREATE INDEX IF NOT EXISTS books_active_idx
  ON books (active);

CREATE TABLE IF NOT EXISTS book_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL,
  inventory_code VARCHAR(40) NOT NULL UNIQUE,
  status copy_status NOT NULL DEFAULT 'available',
  condition_notes TEXT,
  acquired_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT book_copies_book_id_fk
    FOREIGN KEY (book_id)
    REFERENCES books (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS book_copies_book_id_idx
  ON book_copies (book_id);

CREATE INDEX IF NOT EXISTS book_copies_status_idx
  ON book_copies (status);

CREATE INDEX IF NOT EXISTS book_copies_inventory_code_idx
  ON book_copies (inventory_code);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  copy_id UUID NOT NULL,
  created_by UUID NOT NULL,
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  status loan_status NOT NULL DEFAULT 'active',
  renewal_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  return_condition return_condition,
  return_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT loans_student_id_fk
    FOREIGN KEY (student_id)
    REFERENCES students (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT loans_copy_id_fk
    FOREIGN KEY (copy_id)
    REFERENCES book_copies (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT loans_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT loans_due_date_check
    CHECK (due_date >= loan_date),

  CONSTRAINT loans_renewal_count_check
    CHECK (renewal_count >= 0)
);

CREATE INDEX IF NOT EXISTS loans_student_id_idx
  ON loans (student_id);

CREATE INDEX IF NOT EXISTS loans_copy_id_idx
  ON loans (copy_id);

CREATE INDEX IF NOT EXISTS loans_created_by_idx
  ON loans (created_by);

CREATE INDEX IF NOT EXISTS loans_status_idx
  ON loans (status);

CREATE INDEX IF NOT EXISTS loans_due_date_idx
  ON loans (due_date);

CREATE INDEX IF NOT EXISTS loans_loan_date_idx
  ON loans (loan_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS loans_one_active_per_copy_idx
  ON loans (copy_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  book_id UUID NOT NULL,
  created_by UUID NOT NULL,
  status reservation_status NOT NULL DEFAULT 'active',
  notes TEXT,
  ready_at TIMESTAMPTZ,
  expires_at DATE,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reservations_student_id_fk
    FOREIGN KEY (student_id)
    REFERENCES students (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT reservations_book_id_fk
    FOREIGN KEY (book_id)
    REFERENCES books (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT reservations_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS reservations_student_id_idx
  ON reservations (student_id);

CREATE INDEX IF NOT EXISTS reservations_book_id_idx
  ON reservations (book_id);

CREATE INDEX IF NOT EXISTS reservations_status_idx
  ON reservations (status);

CREATE INDEX IF NOT EXISTS reservations_created_at_idx
  ON reservations (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_active_student_book_idx
  ON reservations (student_id, book_id)
  WHERE status IN ('active', 'ready');

CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL,
  created_by UUID NOT NULL,
  channel VARCHAR(80) NOT NULL,
  result VARCHAR(100) NOT NULL DEFAULT 'Avisado',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notices_loan_id_fk
    FOREIGN KEY (loan_id)
    REFERENCES loans (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT notices_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS result VARCHAR(100) NOT NULL DEFAULT 'Avisado';

CREATE INDEX IF NOT EXISTS notices_loan_id_idx
  ON notices (loan_id);

CREATE INDEX IF NOT EXISTS notices_created_at_idx
  ON notices (created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  school_name VARCHAR(120) NOT NULL DEFAULT 'Minha Escola',
  library_name VARCHAR(120) NOT NULL DEFAULT 'Biblioteca Escolar',
  contact_email VARCHAR(180),
  contact_phone VARCHAR(40),
  current_school_year INTEGER NOT NULL DEFAULT 2026,
  default_loan_days INTEGER NOT NULL DEFAULT 14,
  max_active_loans INTEGER NOT NULL DEFAULT 2,
  max_renewals INTEGER NOT NULL DEFAULT 1,
  renewal_days INTEGER NOT NULL DEFAULT 7,
  due_soon_days INTEGER NOT NULL DEFAULT 2,
  reservation_hold_days INTEGER NOT NULL DEFAULT 3,
  block_overdue_students BOOLEAN NOT NULL DEFAULT TRUE,
  notice_template TEXT NOT NULL DEFAULT 'Olá, informamos que o aluno {aluno}, da turma {turma}, está com o livro “{livro}” em atraso desde {data}. O atraso é de {dias} dia(s). Pedimos a devolução à biblioteca da {escola}.',
  reservation_template TEXT NOT NULL DEFAULT 'Olá, {aluno}. O livro “{livro}” reservado para você está disponível na biblioteca da {escola} até {validade}.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT settings_single_row
    CHECK (id = 1),

  CONSTRAINT settings_current_school_year_check
    CHECK (current_school_year BETWEEN 2020 AND 2100),

  CONSTRAINT settings_default_loan_days_check
    CHECK (default_loan_days BETWEEN 1 AND 90),

  CONSTRAINT settings_max_active_loans_check
    CHECK (max_active_loans BETWEEN 1 AND 20),

  CONSTRAINT settings_max_renewals_check
    CHECK (max_renewals BETWEEN 0 AND 10),

  CONSTRAINT settings_renewal_days_check
    CHECK (renewal_days BETWEEN 1 AND 90),

  CONSTRAINT settings_due_soon_days_check
    CHECK (due_soon_days BETWEEN 0 AND 30),

  CONSTRAINT settings_reservation_hold_days_check
    CHECK (reservation_hold_days BETWEEN 1 AND 30)
);

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS library_name VARCHAR(120) NOT NULL DEFAULT 'Biblioteca Escolar';

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(180);

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40);

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS current_school_year INTEGER NOT NULL DEFAULT 2026;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS reservation_hold_days INTEGER NOT NULL DEFAULT 3;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS block_overdue_students BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS reservation_template TEXT NOT NULL DEFAULT 'Olá, {aluno}. O livro “{livro}” reservado para você está disponível na biblioteca da {escola} até {validade}.';

INSERT INTO settings (
  id,
  school_name,
  library_name,
  current_school_year,
  default_loan_days,
  max_active_loans,
  max_renewals,
  renewal_days,
  due_soon_days,
  reservation_hold_days,
  block_overdue_students
)
VALUES (
  1,
  'Minha Escola',
  'Biblioteca Escolar',
  2026,
  14,
  2,
  1,
  7,
  2,
  3,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_logs_user_id_fk
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON audit_logs (user_id);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON audit_logs (action);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at
  ON users;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS classes_set_updated_at
  ON classes;

CREATE TRIGGER classes_set_updated_at
BEFORE UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS students_set_updated_at
  ON students;

CREATE TRIGGER students_set_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS books_set_updated_at
  ON books;

CREATE TRIGGER books_set_updated_at
BEFORE UPDATE ON books
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS book_copies_set_updated_at
  ON book_copies;

CREATE TRIGGER book_copies_set_updated_at
BEFORE UPDATE ON book_copies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS loans_set_updated_at
  ON loans;

CREATE TRIGGER loans_set_updated_at
BEFORE UPDATE ON loans
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservations_set_updated_at
  ON reservations;

CREATE TRIGGER reservations_set_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS settings_set_updated_at
  ON settings;

CREATE TRIGGER settings_set_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW view_books_inventory AS
SELECT
  b.id,
  b.title,
  b.author,
  b.isbn,
  b.publisher,
  b.publication_year,
  b.category_id,
  c.name AS category_name,
  b.shelf,
  b.active,
  COUNT(bc.id)::INTEGER AS total_copies,
  COUNT(bc.id) FILTER (
    WHERE bc.status = 'available'
  )::INTEGER AS available_copies,
  COUNT(bc.id) FILTER (
    WHERE bc.status = 'loaned'
  )::INTEGER AS loaned_copies,
  COUNT(bc.id) FILTER (
    WHERE bc.status = 'damaged'
  )::INTEGER AS damaged_copies,
  COUNT(bc.id) FILTER (
    WHERE bc.status = 'lost'
  )::INTEGER AS lost_copies,
  COUNT(bc.id) FILTER (
    WHERE bc.status = 'maintenance'
  )::INTEGER AS maintenance_copies
FROM books b
LEFT JOIN categories c
  ON c.id = b.category_id
LEFT JOIN book_copies bc
  ON bc.book_id = b.id
GROUP BY
  b.id,
  c.id;

CREATE OR REPLACE VIEW view_active_loans AS
SELECT
  l.id,
  l.loan_date,
  l.due_date,
  l.renewal_count,
  s.id AS student_id,
  s.full_name AS student_name,
  s.registration_number,
  c.id AS class_id,
  c.name AS class_name,
  b.id AS book_id,
  b.title AS book_title,
  bc.id AS copy_id,
  bc.inventory_code,
  CASE
    WHEN l.due_date < CURRENT_DATE
      THEN 'overdue'
    ELSE 'active'
  END AS calculated_status,
  GREATEST(
    CURRENT_DATE - l.due_date,
    0
  )::INTEGER AS overdue_days
FROM loans l
JOIN students s
  ON s.id = l.student_id
LEFT JOIN classes c
  ON c.id = s.class_id
JOIN book_copies bc
  ON bc.id = l.copy_id
JOIN books b
  ON b.id = bc.book_id
WHERE l.status = 'active';

CREATE OR REPLACE VIEW view_student_library_status AS
SELECT
  s.id,
  s.full_name,
  s.registration_number,
  s.class_id,
  c.name AS class_name,
  s.active,
  COUNT(l.id) FILTER (
    WHERE l.status = 'active'
  )::INTEGER AS active_loans,
  COUNT(l.id) FILTER (
    WHERE l.status = 'active'
      AND l.due_date < CURRENT_DATE
  )::INTEGER AS overdue_loans,
  COUNT(l.id)::INTEGER AS total_loans,
  COUNT(r.id) FILTER (
    WHERE r.status IN ('active', 'ready')
  )::INTEGER AS active_reservations
FROM students s
LEFT JOIN classes c
  ON c.id = s.class_id
LEFT JOIN loans l
  ON l.student_id = s.id
LEFT JOIN reservations r
  ON r.student_id = s.id
GROUP BY
  s.id,
  c.id;

CREATE OR REPLACE VIEW view_pending_loans AS
SELECT
  l.id,
  l.student_id,
  l.copy_id,
  l.loan_date,
  l.due_date,
  s.full_name AS student_name,
  s.registration_number,
  s.guardian_contact,
  c.name AS class_name,
  b.id AS book_id,
  b.title AS book_title,
  bc.inventory_code,
  (CURRENT_DATE - l.due_date)::INTEGER AS overdue_days,
  COALESCE(notice_data.notice_count, 0)::INTEGER AS notice_count,
  notice_data.last_notice_at
FROM loans l
JOIN students s
  ON s.id = l.student_id
LEFT JOIN classes c
  ON c.id = s.class_id
JOIN book_copies bc
  ON bc.id = l.copy_id
JOIN books b
  ON b.id = bc.book_id
LEFT JOIN (
  SELECT
    loan_id,
    COUNT(*)::INTEGER AS notice_count,
    MAX(created_at) AS last_notice_at
  FROM notices
  GROUP BY loan_id
) notice_data
  ON notice_data.loan_id = l.id
WHERE l.status = 'active'
  AND l.due_date < CURRENT_DATE;

INSERT INTO categories (name)
VALUES
  ('Literatura Brasileira'),
  ('Literatura Estrangeira'),
  ('Infantojuvenil'),
  ('Poesia'),
  ('Contos e Crônicas'),
  ('Ciências'),
  ('Biologia'),
  ('Física'),
  ('Química'),
  ('Matemática'),
  ('História'),
  ('Geografia'),
  ('Filosofia'),
  ('Sociologia'),
  ('Artes'),
  ('Tecnologia'),
  ('Biografias'),
  ('Quadrinhos'),
  ('Vestibular e ENEM'),
  ('Dicionários e Referência')
ON CONFLICT (name) DO NOTHING;

-- Contas iniciais para apresentação (troque as senhas depois do primeiro acesso).
INSERT INTO users (name, email, password_hash, role, active) VALUES
  ('Administrador BookShare', 'admin@bookshare.com', crypt('BookShare@2026', gen_salt('bf', 12)), 'admin', TRUE),
  ('Bibliotecária', 'biblioteca@bookshare.com', crypt('Biblioteca@2026', gen_salt('bf', 12)), 'librarian', TRUE)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  active = TRUE,
  updated_at = NOW();

INSERT INTO classes (name, shift, school_year, teacher_name, active) VALUES
  ('3º A', 'Manhã', 2026, 'Professora Ana Martins', TRUE),
  ('3º B', 'Manhã', 2026, 'Professor Carlos Mendes', TRUE)
ON CONFLICT (name, shift, school_year) DO UPDATE SET
  teacher_name = EXCLUDED.teacher_name,
  active = TRUE,
  updated_at = NOW();

INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Ana Clara Souza', '2026A001', c.id, 1, '(41) 90001-0173', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Arthur Henrique Lima', '2026A002', c.id, 2, '(41) 90002-0346', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Beatriz Oliveira Santos', '2026A003', c.id, 3, '(41) 90003-0519', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Bruno Rafael Costa', '2026A004', c.id, 4, '(41) 90004-0692', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Camila Ferreira Alves', '2026A005', c.id, 5, '(41) 90005-0865', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Carlos Eduardo Ribeiro', '2026A006', c.id, 6, '(41) 90006-1038', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Daniela Martins Rocha', '2026A007', c.id, 7, '(41) 90007-1211', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Davi Lucas Gomes', '2026A008', c.id, 8, '(41) 90008-1384', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Eduarda Vitória Silva', '2026A009', c.id, 9, '(41) 90009-1557', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Enzo Gabriel Pereira', '2026A010', c.id, 10, '(41) 90010-1730', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Fernanda Almeida Castro', '2026A011', c.id, 11, '(41) 90011-1903', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Felipe Augusto Nunes', '2026A012', c.id, 12, '(41) 90012-2076', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Gabriela Rodrigues Melo', '2026A013', c.id, 13, '(41) 90013-2249', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Gustavo Henrique Barros', '2026A014', c.id, 14, '(41) 90014-2422', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Helena Cristina Moraes', '2026A015', c.id, 15, '(41) 90015-2595', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Igor Matheus Cardoso', '2026A016', c.id, 16, '(41) 90016-2768', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Isabela Fernandes Dias', '2026A017', c.id, 17, '(41) 90017-2941', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'João Pedro Batista', '2026A018', c.id, 18, '(41) 90018-3114', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Júlia Caroline Vieira', '2026A019', c.id, 19, '(41) 90019-3287', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Kaique Vinícius Ramos', '2026A020', c.id, 20, '(41) 90020-3460', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Larissa Monteiro Freitas', '2026A021', c.id, 21, '(41) 90021-3633', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Leonardo Gabriel Pinto', '2026A022', c.id, 22, '(41) 90022-3806', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Letícia Aparecida Lopes', '2026A023', c.id, 23, '(41) 90023-3979', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Lucas Rafael Teixeira', '2026A024', c.id, 24, '(41) 90024-4152', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Luana Beatriz Andrade', '2026A025', c.id, 25, '(41) 90025-4325', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Marcos Vinícius Moreira', '2026A026', c.id, 26, '(41) 90026-4498', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Maria Eduarda Campos', '2026A027', c.id, 27, '(41) 90027-4671', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Matheus Felipe Barbosa', '2026A028', c.id, 28, '(41) 90028-4844', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Nathalia Cristina Martins', '2026A029', c.id, 29, '(41) 90029-5017', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Pedro Henrique Araújo', '2026A030', c.id, 30, '(41) 90030-5190', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º A' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Alice Vitória Carvalho', '2026B001', c.id, 1, '(41) 90001-0173', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'André Luiz Correia', '2026B002', c.id, 2, '(41) 90002-0346', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Bianca Gabrielly Farias', '2026B003', c.id, 3, '(41) 90003-0519', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Caio Henrique Mendes', '2026B004', c.id, 4, '(41) 90004-0692', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Carolina Alves Cunha', '2026B005', c.id, 5, '(41) 90005-0865', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Cauã Felipe Miranda', '2026B006', c.id, 6, '(41) 90006-1038', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Débora Cristina Lima', '2026B007', c.id, 7, '(41) 90007-1211', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Diego Rafael Souza', '2026B008', c.id, 8, '(41) 90008-1384', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Emanuelly Vitória Rocha', '2026B009', c.id, 9, '(41) 90009-1557', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Eric Gabriel Martins', '2026B010', c.id, 10, '(41) 90010-1730', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Ester Caroline Santos', '2026B011', c.id, 11, '(41) 90011-1903', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Flávia Beatriz Prado', '2026B012', c.id, 12, '(41) 90012-2076', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Gabriel Henrique Reis', '2026B013', c.id, 13, '(41) 90013-2249', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Giovana Cristina Neves', '2026B014', c.id, 14, '(41) 90014-2422', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Heitor Augusto Silva', '2026B015', c.id, 15, '(41) 90015-2595', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Heloísa Fernandes Costa', '2026B016', c.id, 16, '(41) 90016-2768', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'José Victor Almeida', '2026B017', c.id, 17, '(41) 90017-2941', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Karen Luiza Nascimento', '2026B018', c.id, 18, '(41) 90018-3114', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Laura Beatriz Gomes', '2026B019', c.id, 19, '(41) 90019-3287', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Leandro Matheus Dias', '2026B020', c.id, 20, '(41) 90020-3460', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Lívia Caroline Ribeiro', '2026B021', c.id, 21, '(41) 90021-3633', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Lorena Vitória Pinto', '2026B022', c.id, 22, '(41) 90022-3806', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Luiz Gustavo Ferreira', '2026B023', c.id, 23, '(41) 90023-3979', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Manuela Cristina Barros', '2026B024', c.id, 24, '(41) 90024-4152', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Miguel Henrique Lopes', '2026B025', c.id, 25, '(41) 90025-4325', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Nicole Gabriela Castro', '2026B026', c.id, 26, '(41) 90026-4498', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Rafael Augusto Moraes', '2026B027', c.id, 27, '(41) 90027-4671', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Samuel Lucas Oliveira', '2026B028', c.id, 28, '(41) 90028-4844', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Sophia Vitória Pereira', '2026B029', c.id, 29, '(41) 90029-5017', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();
INSERT INTO students (full_name, registration_number, class_id, roll_number, guardian_contact, notes, active)
SELECT 'Vitor Hugo Rodrigues', '2026B030', c.id, 30, '(41) 90030-5190', 'Aluno de demonstração', TRUE
FROM classes c WHERE c.name = '3º B' AND c.shift = 'Manhã' AND c.school_year = 2026
ON CONFLICT (registration_number) DO UPDATE SET
  full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, roll_number = EXCLUDED.roll_number, guardian_contact = EXCLUDED.guardian_contact, active = TRUE, updated_at = NOW();

-- Fotografias de demonstração dos alunos. Substitua pelas fotos autorizadas da escola no painel.



-- Fotografias demonstrativas reais para os 60 alunos.
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/3.jpg' WHERE registration_number = '2026A001';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/10.jpg' WHERE registration_number = '2026A002';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/17.jpg' WHERE registration_number = '2026A003';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/24.jpg' WHERE registration_number = '2026A004';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/31.jpg' WHERE registration_number = '2026A005';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/38.jpg' WHERE registration_number = '2026A006';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/45.jpg' WHERE registration_number = '2026A007';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/52.jpg' WHERE registration_number = '2026A008';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/59.jpg' WHERE registration_number = '2026A009';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/66.jpg' WHERE registration_number = '2026A010';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/73.jpg' WHERE registration_number = '2026A011';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/80.jpg' WHERE registration_number = '2026A012';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/87.jpg' WHERE registration_number = '2026A013';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/94.jpg' WHERE registration_number = '2026A014';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/1.jpg' WHERE registration_number = '2026A015';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/8.jpg' WHERE registration_number = '2026A016';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/15.jpg' WHERE registration_number = '2026A017';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/22.jpg' WHERE registration_number = '2026A018';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/29.jpg' WHERE registration_number = '2026A019';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/36.jpg' WHERE registration_number = '2026A020';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/43.jpg' WHERE registration_number = '2026A021';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/50.jpg' WHERE registration_number = '2026A022';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/57.jpg' WHERE registration_number = '2026A023';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/64.jpg' WHERE registration_number = '2026A024';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/71.jpg' WHERE registration_number = '2026A025';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/78.jpg' WHERE registration_number = '2026A026';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/85.jpg' WHERE registration_number = '2026A027';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/92.jpg' WHERE registration_number = '2026A028';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/99.jpg' WHERE registration_number = '2026A029';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/6.jpg' WHERE registration_number = '2026A030';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/13.jpg' WHERE registration_number = '2026B001';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/20.jpg' WHERE registration_number = '2026B002';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/27.jpg' WHERE registration_number = '2026B003';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/34.jpg' WHERE registration_number = '2026B004';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/41.jpg' WHERE registration_number = '2026B005';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/48.jpg' WHERE registration_number = '2026B006';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/55.jpg' WHERE registration_number = '2026B007';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/62.jpg' WHERE registration_number = '2026B008';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/69.jpg' WHERE registration_number = '2026B009';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/76.jpg' WHERE registration_number = '2026B010';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/83.jpg' WHERE registration_number = '2026B011';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/90.jpg' WHERE registration_number = '2026B012';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/97.jpg' WHERE registration_number = '2026B013';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/4.jpg' WHERE registration_number = '2026B014';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/11.jpg' WHERE registration_number = '2026B015';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/18.jpg' WHERE registration_number = '2026B016';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/25.jpg' WHERE registration_number = '2026B017';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/32.jpg' WHERE registration_number = '2026B018';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/39.jpg' WHERE registration_number = '2026B019';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/46.jpg' WHERE registration_number = '2026B020';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/53.jpg' WHERE registration_number = '2026B021';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/60.jpg' WHERE registration_number = '2026B022';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/67.jpg' WHERE registration_number = '2026B023';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/74.jpg' WHERE registration_number = '2026B024';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/81.jpg' WHERE registration_number = '2026B025';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/88.jpg' WHERE registration_number = '2026B026';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/95.jpg' WHERE registration_number = '2026B027';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/2.jpg' WHERE registration_number = '2026B028';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/women/9.jpg' WHERE registration_number = '2026B029';
UPDATE students SET photo_url = 'https://randomuser.me/api/portraits/men/16.jpg' WHERE registration_number = '2026B030';

INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Dom Casmurro', 'Machado de Assis', 'BOOKSHARE-001', 'Acervo BookShare', 1899, c.id, 'A-01', 'Exemplar de demonstração da categoria Literatura Brasileira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23164c43%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d4ae62%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20BRASILEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%92%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EDom%20Casmurro%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMachado%20de%20Assis%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Brasileira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-001-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-001'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-001-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-001'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Memórias Póstumas de Brás Cubas', 'Machado de Assis', 'BOOKSHARE-002', 'Acervo BookShare', 1881, c.id, 'A-02', 'Exemplar de demonstração da categoria Literatura Brasileira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23164c43%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d4ae62%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20BRASILEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%92%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EMem%C3%B3rias%20P%C3%B3stumas%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Ede%20Br%C3%A1s%20Cubas%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMachado%20de%20Assis%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Brasileira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-002-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-002'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-002-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-002'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Cortiço', 'Aluísio Azevedo', 'BOOKSHARE-003', 'Acervo BookShare', 1890, c.id, 'A-03', 'Exemplar de demonstração da categoria Literatura Brasileira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23164c43%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d4ae62%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20BRASILEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%92%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Corti%C3%A7o%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EAlu%C3%ADsio%20Azevedo%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Brasileira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-003-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-003'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-003-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-003'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Vidas Secas', 'Graciliano Ramos', 'BOOKSHARE-004', 'Acervo BookShare', 1938, c.id, 'A-04', 'Exemplar de demonstração da categoria Literatura Brasileira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23164c43%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d4ae62%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20BRASILEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%92%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EVidas%20Secas%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EGraciliano%20Ramos%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Brasileira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-004-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-004'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-004-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-004'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Capitães da Areia', 'Jorge Amado', 'BOOKSHARE-005', 'Acervo BookShare', 1937, c.id, 'A-05', 'Exemplar de demonstração da categoria Literatura Brasileira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23164c43%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d4ae62%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20BRASILEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%92%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ECapit%C3%A3es%20da%20Areia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJorge%20Amado%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Brasileira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-005-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-005'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-005-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-005'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Crime e Castigo', 'Fiódor Dostoiévski', 'BOOKSHARE-006', 'Acervo BookShare', 1866, c.id, 'A-06', 'Exemplar de demonstração da categoria Literatura Estrangeira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a2d32%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9a56c%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20ESTRANGEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%85%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ECrime%20e%20Castigo%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EFi%C3%B3dor%20Dostoi%C3%A9vski%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Estrangeira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-006-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-006'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-006-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-006'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Os Irmãos Karamázov', 'Fiódor Dostoiévski', 'BOOKSHARE-007', 'Acervo BookShare', 1880, c.id, 'A-07', 'Exemplar de demonstração da categoria Literatura Estrangeira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a2d32%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9a56c%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20ESTRANGEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%85%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EOs%20Irm%C3%A3os%20Karam%C3%A1zov%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EFi%C3%B3dor%20Dostoi%C3%A9vski%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Estrangeira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-007-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-007'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-007-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-007'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Guerra e Paz', 'Liev Tolstói', 'BOOKSHARE-008', 'Acervo BookShare', 1869, c.id, 'A-08', 'Exemplar de demonstração da categoria Literatura Estrangeira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a2d32%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9a56c%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20ESTRANGEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%85%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EGuerra%20e%20Paz%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELiev%20Tolst%C3%B3i%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Estrangeira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-008-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-008'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-008-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-008'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Anna Kariênina', 'Liev Tolstói', 'BOOKSHARE-009', 'Acervo BookShare', 1878, c.id, 'A-09', 'Exemplar de demonstração da categoria Literatura Estrangeira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a2d32%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9a56c%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20ESTRANGEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%85%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAnna%20Kari%C3%AAnina%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELiev%20Tolst%C3%B3i%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Estrangeira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-009-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-009'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-009-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-009'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Mestre e Margarida', 'Mikhail Bulgákov', 'BOOKSHARE-010', 'Acervo BookShare', 1967, c.id, 'A-10', 'Exemplar de demonstração da categoria Literatura Estrangeira. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a2d32%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9a56c%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ELITERATURA%20ESTRANGEIRA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%85%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Mestre%20e%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EMargarida%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMikhail%20Bulg%C3%A1kov%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Literatura Estrangeira'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-010-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-010'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-010-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-010'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Pequeno Príncipe', 'Antoine de Saint-Exupéry', 'BOOKSHARE-011', 'Acervo BookShare', 1943, c.id, 'A-11', 'Exemplar de demonstração da categoria Infantojuvenil. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232c6e9e%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23f2cc68%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EINFANTOJUVENIL%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Pequeno%20Pr%C3%ADncipe%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EAntoine%20de%20Saint-Exup%C3%A9ry%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Infantojuvenil'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-011-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-011'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-011-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-011'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Alice no País das Maravilhas', 'Lewis Carroll', 'BOOKSHARE-012', 'Acervo BookShare', 1865, c.id, 'A-12', 'Exemplar de demonstração da categoria Infantojuvenil. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232c6e9e%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23f2cc68%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EINFANTOJUVENIL%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAlice%20no%20Pa%C3%ADs%20das%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EMaravilhas%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELewis%20Carroll%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Infantojuvenil'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-012-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-012'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-012-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-012'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'As Aventuras de Tom Sawyer', 'Mark Twain', 'BOOKSHARE-013', 'Acervo BookShare', 1876, c.id, 'A-13', 'Exemplar de demonstração da categoria Infantojuvenil. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232c6e9e%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23f2cc68%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EINFANTOJUVENIL%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAs%20Aventuras%20de%20Tom%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ESawyer%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMark%20Twain%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Infantojuvenil'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-013-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-013'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-013-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-013'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Mágico de Oz', 'L. Frank Baum', 'BOOKSHARE-014', 'Acervo BookShare', 1900, c.id, 'A-14', 'Exemplar de demonstração da categoria Infantojuvenil. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232c6e9e%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23f2cc68%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EINFANTOJUVENIL%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20M%C3%A1gico%20de%20Oz%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EL.%20Frank%20Baum%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Infantojuvenil'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-014-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-014'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-014-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-014'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Ilha do Tesouro', 'Robert Louis Stevenson', 'BOOKSHARE-015', 'Acervo BookShare', 1883, c.id, 'A-15', 'Exemplar de demonstração da categoria Infantojuvenil. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232c6e9e%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23f2cc68%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EINFANTOJUVENIL%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Ilha%20do%20Tesouro%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERobert%20Louis%20Stevenson%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Infantojuvenil'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-015-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-015'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-015-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-015'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Alguma Poesia', 'Carlos Drummond de Andrade', 'BOOKSHARE-016', 'Acervo BookShare', 1930, c.id, 'A-16', 'Exemplar de demonstração da categoria Poesia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%236e4c8b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9b4e7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EPOESIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9D%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAlguma%20Poesia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECarlos%20Drummond%20de%20Andrade%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Poesia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-016-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-016'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-016-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-016'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Mensagem', 'Fernando Pessoa', 'BOOKSHARE-017', 'Acervo BookShare', 1934, c.id, 'A-17', 'Exemplar de demonstração da categoria Poesia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%236e4c8b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9b4e7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EPOESIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9D%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EMensagem%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EFernando%20Pessoa%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Poesia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-017-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-017'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-017-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-017'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Antologia Poética', 'Vinicius de Moraes', 'BOOKSHARE-018', 'Acervo BookShare', 1954, c.id, 'A-18', 'Exemplar de demonstração da categoria Poesia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%236e4c8b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9b4e7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EPOESIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9D%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAntologia%20Po%C3%A9tica%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EVinicius%20de%20Moraes%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Poesia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-018-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-018'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-018-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-018'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Romanceiro da Inconfidência', 'Cecília Meireles', 'BOOKSHARE-019', 'Acervo BookShare', 1953, c.id, 'A-19', 'Exemplar de demonstração da categoria Poesia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%236e4c8b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9b4e7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EPOESIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9D%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ERomanceiro%20da%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EInconfid%C3%AAncia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECec%C3%ADlia%20Meireles%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Poesia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-019-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-019'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-019-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-019'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Os Lusíadas', 'Luís de Camões', 'BOOKSHARE-020', 'Acervo BookShare', 1572, c.id, 'A-20', 'Exemplar de demonstração da categoria Poesia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%236e4c8b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d9b4e7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EPOESIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9D%A6%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EOs%20Lus%C3%ADadas%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELu%C3%ADs%20de%20Cam%C3%B5es%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Poesia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-020-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-020'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-020-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-020'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Laços de Família', 'Clarice Lispector', 'BOOKSHARE-021', 'Acervo BookShare', 1960, c.id, 'B-01', 'Exemplar de demonstração da categoria Contos e Crônicas. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237d5541%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e3b68f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECONTOS%20E%20CR%C3%94NICAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%95%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ELa%C3%A7os%20de%20Fam%C3%ADlia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EClarice%20Lispector%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Contos e Crônicas'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-021-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-021'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Morangos Mofados', 'Caio Fernando Abreu', 'BOOKSHARE-022', 'Acervo BookShare', 1982, c.id, 'B-02', 'Exemplar de demonstração da categoria Contos e Crônicas. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237d5541%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e3b68f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECONTOS%20E%20CR%C3%94NICAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%95%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EMorangos%20Mofados%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECaio%20Fernando%20Abreu%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Contos e Crônicas'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-022-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-022'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Contos Novos', 'Mário de Andrade', 'BOOKSHARE-023', 'Acervo BookShare', 1947, c.id, 'B-03', 'Exemplar de demonstração da categoria Contos e Crônicas. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237d5541%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e3b68f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECONTOS%20E%20CR%C3%94NICAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%95%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EContos%20Novos%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EM%C3%A1rio%20de%20Andrade%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Contos e Crônicas'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-023-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-023'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Primeiras Estórias', 'João Guimarães Rosa', 'BOOKSHARE-024', 'Acervo BookShare', 1962, c.id, 'B-04', 'Exemplar de demonstração da categoria Contos e Crônicas. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237d5541%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e3b68f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECONTOS%20E%20CR%C3%94NICAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%95%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EPrimeiras%20Est%C3%B3rias%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJo%C3%A3o%20Guimar%C3%A3es%20Rosa%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Contos e Crônicas'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-024-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-024'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Alienista', 'Machado de Assis', 'BOOKSHARE-025', 'Acervo BookShare', 1882, c.id, 'B-05', 'Exemplar de demonstração da categoria Contos e Crônicas. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237d5541%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e3b68f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECONTOS%20E%20CR%C3%94NICAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%98%95%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Alienista%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMachado%20de%20Assis%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Contos e Crônicas'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-025-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-025'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Cosmos', 'Carl Sagan', 'BOOKSHARE-026', 'Acervo BookShare', 1980, c.id, 'B-06', 'Exemplar de demonstração da categoria Ciências. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23174c67%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2370c3cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECI%C3%8ANCIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9A%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ECosmos%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECarl%20Sagan%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Ciências'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-026-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-026'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-026-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-026'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Mundo Assombrado pelos Demônios', 'Carl Sagan', 'BOOKSHARE-027', 'Acervo BookShare', 1995, c.id, 'B-07', 'Exemplar de demonstração da categoria Ciências. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23174c67%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2370c3cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECI%C3%8ANCIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9A%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Mundo%20Assombrado%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Epelos%20Dem%C3%B4nios%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECarl%20Sagan%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Ciências'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-027-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-027'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Origem das Espécies', 'Charles Darwin', 'BOOKSHARE-028', 'Acervo BookShare', 1859, c.id, 'B-08', 'Exemplar de demonstração da categoria Ciências. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23174c67%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2370c3cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECI%C3%8ANCIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9A%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Origem%20das%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EEsp%C3%A9cies%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECharles%20Darwin%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Ciências'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-028-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-028'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Primavera Silenciosa', 'Rachel Carson', 'BOOKSHARE-029', 'Acervo BookShare', 1962, c.id, 'B-09', 'Exemplar de demonstração da categoria Ciências. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23174c67%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2370c3cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECI%C3%8ANCIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9A%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EPrimavera%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ESilenciosa%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERachel%20Carson%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Ciências'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-029-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-029'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Breves Respostas para Grandes Questões', 'Stephen Hawking', 'BOOKSHARE-030', 'Acervo BookShare', 2018, c.id, 'B-10', 'Exemplar de demonstração da categoria Ciências. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23174c67%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2370c3cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ECI%C3%8ANCIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9A%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EBreves%20Respostas%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Epara%20Grandes%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EQuest%C3%B5es%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EStephen%20Hawking%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Ciências'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-030-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-030'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Gene Egoísta', 'Richard Dawkins', 'BOOKSHARE-031', 'Acervo BookShare', 1976, c.id, 'B-11', 'Exemplar de demonstração da categoria Biologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%2327613d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238acb86%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%81%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Gene%20Ego%C3%ADsta%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERichard%20Dawkins%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-031-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-031'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-031-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-031'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Dupla Hélice', 'James D. Watson', 'BOOKSHARE-032', 'Acervo BookShare', 1968, c.id, 'B-12', 'Exemplar de demonstração da categoria Biologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%2327613d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238acb86%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%81%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Dupla%20H%C3%A9lice%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJames%20D.%20Watson%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-032-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-032'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Imperador de Todos os Males', 'Siddhartha Mukherjee', 'BOOKSHARE-033', 'Acervo BookShare', 2010, c.id, 'B-13', 'Exemplar de demonstração da categoria Biologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%2327613d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238acb86%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%81%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Imperador%20de%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ETodos%20os%20Males%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ESiddhartha%20Mukherjee%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-033-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-033'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Vida Maravilhosa', 'Stephen Jay Gould', 'BOOKSHARE-034', 'Acervo BookShare', 1989, c.id, 'B-14', 'Exemplar de demonstração da categoria Biologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%2327613d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238acb86%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%81%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Vida%20Maravilhosa%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EStephen%20Jay%20Gould%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-034-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-034'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Canção da Célula', 'Siddhartha Mukherjee', 'BOOKSHARE-035', 'Acervo BookShare', 2022, c.id, 'B-15', 'Exemplar de demonstração da categoria Biologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%2327613d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238acb86%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%81%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Can%C3%A7%C3%A3o%20da%20C%C3%A9lula%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ESiddhartha%20Mukherjee%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-035-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-035'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Uma Breve História do Tempo', 'Stephen Hawking', 'BOOKSHARE-036', 'Acervo BookShare', 1988, c.id, 'B-16', 'Exemplar de demonstração da categoria Física. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23243c72%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2391a9f4%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EF%C3%8DSICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%9E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EUma%20Breve%20Hist%C3%B3ria%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Edo%20Tempo%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EStephen%20Hawking%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Física'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-036-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-036'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-036-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-036'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Seis Peças Fáceis', 'Richard Feynman', 'BOOKSHARE-037', 'Acervo BookShare', 1994, c.id, 'B-17', 'Exemplar de demonstração da categoria Física. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23243c72%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2391a9f4%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EF%C3%8DSICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%9E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ESeis%20Pe%C3%A7as%20F%C3%A1ceis%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERichard%20Feynman%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Física'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-037-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-037'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Universo Numa Casca de Noz', 'Stephen Hawking', 'BOOKSHARE-038', 'Acervo BookShare', 2001, c.id, 'B-18', 'Exemplar de demonstração da categoria Física. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23243c72%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2391a9f4%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EF%C3%8DSICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%9E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Universo%20Numa%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ECasca%20de%20Noz%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EStephen%20Hawking%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Física'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-038-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-038'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Sete Breves Lições de Física', 'Carlo Rovelli', 'BOOKSHARE-039', 'Acervo BookShare', 2014, c.id, 'B-19', 'Exemplar de demonstração da categoria Física. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23243c72%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2391a9f4%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EF%C3%8DSICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%9E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ESete%20Breves%20Li%C3%A7%C3%B5es%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Ede%20F%C3%ADsica%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECarlo%20Rovelli%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Física'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-039-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-039'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Física do Impossível', 'Michio Kaku', 'BOOKSHARE-040', 'Acervo BookShare', 2008, c.id, 'B-20', 'Exemplar de demonstração da categoria Física. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23243c72%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2391a9f4%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EF%C3%8DSICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%9E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EF%C3%ADsica%20do%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EImposs%C3%ADvel%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMichio%20Kaku%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Física'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-040-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-040'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Colher que Desaparece', 'Sam Kean', 'BOOKSHARE-041', 'Acervo BookShare', 2010, c.id, 'C-01', 'Exemplar de demonstração da categoria Química. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235a3c7a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23caa5e8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQU%C3%8DMICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%89%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Colher%20que%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EDesaparece%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ESam%20Kean%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Química'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-041-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-041'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-041-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-041'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Tio Tungstênio', 'Oliver Sacks', 'BOOKSHARE-042', 'Acervo BookShare', 2001, c.id, 'C-02', 'Exemplar de demonstração da categoria Química. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235a3c7a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23caa5e8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQU%C3%8DMICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%89%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ETio%20Tungst%C3%AAnio%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EOliver%20Sacks%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Química'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-042-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-042'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Os Botões de Napoleão', 'Penny Le Couteur e Jay Burreson', 'BOOKSHARE-043', 'Acervo BookShare', 2003, c.id, 'C-03', 'Exemplar de demonstração da categoria Química. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235a3c7a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23caa5e8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQU%C3%8DMICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%89%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EOs%20Bot%C3%B5es%20de%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ENapole%C3%A3o%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EPenny%20Le%20Couteur%20e%20Jay%20Burreson%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Química'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-043-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-043'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Tabela Periódica', 'Primo Levi', 'BOOKSHARE-044', 'Acervo BookShare', 1975, c.id, 'C-04', 'Exemplar de demonstração da categoria Química. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235a3c7a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23caa5e8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQU%C3%8DMICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%89%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Tabela%20Peri%C3%B3dica%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EPrimo%20Levi%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Química'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-044-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-044'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Química do Cotidiano', 'Equipe Pedagógica BookShare', 'BOOKSHARE-045', 'Acervo BookShare', 2026, c.id, 'C-05', 'Exemplar de demonstração da categoria Química. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235a3c7a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23caa5e8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQU%C3%8DMICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%89%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EQu%C3%ADmica%20do%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ECotidiano%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Química'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-045-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-045'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Homem que Calculava', 'Malba Tahan', 'BOOKSHARE-046', 'Acervo BookShare', 1938, c.id, 'C-06', 'Exemplar de demonstração da categoria Matemática. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23234f59%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238bd0c3%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EMATEM%C3%81TICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%91%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Homem%20que%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ECalculava%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMalba%20Tahan%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Matemática'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-046-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-046'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-046-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-046'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Último Teorema de Fermat', 'Simon Singh', 'BOOKSHARE-047', 'Acervo BookShare', 1997, c.id, 'C-07', 'Exemplar de demonstração da categoria Matemática. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23234f59%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238bd0c3%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EMATEM%C3%81TICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%91%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20%C3%9Altimo%20Teorema%20de%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EFermat%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ESimon%20Singh%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Matemática'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-047-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-047'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Diabo dos Números', 'Hans Magnus Enzensberger', 'BOOKSHARE-048', 'Acervo BookShare', 1997, c.id, 'C-08', 'Exemplar de demonstração da categoria Matemática. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23234f59%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238bd0c3%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EMATEM%C3%81TICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%91%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Diabo%20dos%20N%C3%BAmeros%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EHans%20Magnus%20Enzensberger%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Matemática'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-048-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-048'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Alex no País dos Números', 'Alex Bellos', 'BOOKSHARE-049', 'Acervo BookShare', 2010, c.id, 'C-09', 'Exemplar de demonstração da categoria Matemática. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23234f59%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238bd0c3%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EMATEM%C3%81TICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%91%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAlex%20no%20Pa%C3%ADs%20dos%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EN%C3%BAmeros%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EAlex%20Bellos%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Matemática'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-049-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-049'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Música dos Números Primos', 'Marcus du Sautoy', 'BOOKSHARE-050', 'Acervo BookShare', 2003, c.id, 'C-10', 'Exemplar de demonstração da categoria Matemática. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23234f59%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238bd0c3%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EMATEM%C3%81TICA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%88%91%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20M%C3%BAsica%20dos%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EN%C3%BAmeros%20Primos%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMarcus%20du%20Sautoy%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Matemática'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-050-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-050'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT '1808', 'Laurentino Gomes', 'BOOKSHARE-051', 'Acervo BookShare', 2007, c.id, 'C-11', 'Exemplar de demonstração da categoria História. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23744a2a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d8af72%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EHIST%C3%93RIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3E1808%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELaurentino%20Gomes%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'História'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-051-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-051'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-051-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-051'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT '1822', 'Laurentino Gomes', 'BOOKSHARE-052', 'Acervo BookShare', 2010, c.id, 'C-12', 'Exemplar de demonstração da categoria História. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23744a2a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d8af72%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EHIST%C3%93RIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3E1822%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELaurentino%20Gomes%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'História'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-052-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-052'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Brasil: Uma Biografia', 'Lilia Schwarcz e Heloisa Starling', 'BOOKSHARE-053', 'Acervo BookShare', 2015, c.id, 'C-13', 'Exemplar de demonstração da categoria História. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23744a2a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d8af72%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EHIST%C3%93RIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EBrasil%3A%20Uma%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EBiografia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ELilia%20Schwarcz%20e%20Heloisa%20Starling%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'História'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-053-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-053'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Sapiens', 'Yuval Noah Harari', 'BOOKSHARE-054', 'Acervo BookShare', 2011, c.id, 'C-14', 'Exemplar de demonstração da categoria História. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23744a2a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d8af72%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EHIST%C3%93RIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ESapiens%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EYuval%20Noah%20Harari%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'História'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-054-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-054'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Era dos Extremos', 'Eric Hobsbawm', 'BOOKSHARE-055', 'Acervo BookShare', 1994, c.id, 'C-15', 'Exemplar de demonstração da categoria História. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23744a2a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d8af72%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EHIST%C3%93RIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%8C%9B%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Era%20dos%20Extremos%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEric%20Hobsbawm%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'História'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-055-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-055'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Por uma Outra Globalização', 'Milton Santos', 'BOOKSHARE-056', 'Acervo BookShare', 2000, c.id, 'C-16', 'Exemplar de demonstração da categoria Geografia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232b6659%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238fc6a7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EGEOGRAFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EPor%20uma%20Outra%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EGlobaliza%C3%A7%C3%A3o%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMilton%20Santos%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Geografia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-056-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-056'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-056-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-056'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Geografia da Fome', 'Josué de Castro', 'BOOKSHARE-057', 'Acervo BookShare', 1946, c.id, 'C-17', 'Exemplar de demonstração da categoria Geografia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232b6659%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238fc6a7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EGEOGRAFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EGeografia%20da%20Fome%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJosu%C3%A9%20de%20Castro%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Geografia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-057-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-057'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Prisioneiros da Geografia', 'Tim Marshall', 'BOOKSHARE-058', 'Acervo BookShare', 2015, c.id, 'C-18', 'Exemplar de demonstração da categoria Geografia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232b6659%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238fc6a7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EGEOGRAFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EPrisioneiros%20da%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EGeografia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ETim%20Marshall%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Geografia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-058-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-058'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Armas, Germes e Aço', 'Jared Diamond', 'BOOKSHARE-059', 'Acervo BookShare', 1997, c.id, 'C-19', 'Exemplar de demonstração da categoria Geografia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232b6659%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238fc6a7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EGEOGRAFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EArmas%2C%20Germes%20e%20A%C3%A7o%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJared%20Diamond%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Geografia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-059-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-059'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Poder da Geografia', 'Tim Marshall', 'BOOKSHARE-060', 'Acervo BookShare', 2021, c.id, 'C-20', 'Exemplar de demonstração da categoria Geografia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%232b6659%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238fc6a7%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EGEOGRAFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Poder%20da%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EGeografia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ETim%20Marshall%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Geografia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-060-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-060'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A República', 'Platão', 'BOOKSHARE-061', 'Acervo BookShare', NULL, c.id, 'D-01', 'Exemplar de demonstração da categoria Filosofia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23423d63%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23aaa0db%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EFILOSOFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%87%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Rep%C3%BAblica%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EPlat%C3%A3o%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Filosofia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-061-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-061'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-061-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-061'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Ética a Nicômaco', 'Aristóteles', 'BOOKSHARE-062', 'Acervo BookShare', NULL, c.id, 'D-02', 'Exemplar de demonstração da categoria Filosofia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23423d63%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23aaa0db%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EFILOSOFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%87%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3E%C3%89tica%20a%20Nic%C3%B4maco%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EArist%C3%B3teles%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Filosofia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-062-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-062'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Discurso do Método', 'René Descartes', 'BOOKSHARE-063', 'Acervo BookShare', 1637, c.id, 'D-03', 'Exemplar de demonstração da categoria Filosofia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23423d63%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23aaa0db%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EFILOSOFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%87%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EDiscurso%20do%20M%C3%A9todo%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERen%C3%A9%20Descartes%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Filosofia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-063-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-063'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Mundo de Sofia', 'Jostein Gaarder', 'BOOKSHARE-064', 'Acervo BookShare', 1991, c.id, 'D-04', 'Exemplar de demonstração da categoria Filosofia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23423d63%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23aaa0db%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EFILOSOFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%87%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Mundo%20de%20Sofia%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJostein%20Gaarder%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Filosofia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-064-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-064'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Assim Falou Zaratustra', 'Friedrich Nietzsche', 'BOOKSHARE-065', 'Acervo BookShare', 1883, c.id, 'D-05', 'Exemplar de demonstração da categoria Filosofia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23423d63%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23aaa0db%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EFILOSOFIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%97%87%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAssim%20Falou%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EZaratustra%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EFriedrich%20Nietzsche%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Filosofia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-065-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-065'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Ética Protestante e o Espírito do Capitalismo', 'Max Weber', 'BOOKSHARE-066', 'Acervo BookShare', 1905, c.id, 'D-06', 'Exemplar de demonstração da categoria Sociologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a3e50%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d991a6%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ESOCIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%89%A1%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20%C3%89tica%20Protestante%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Ee%20o%20Esp%C3%ADrito%20do%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ECapitalismo%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMax%20Weber%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Sociologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-066-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-066'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-066-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-066'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'As Regras do Método Sociológico', 'Émile Durkheim', 'BOOKSHARE-067', 'Acervo BookShare', 1895, c.id, 'D-07', 'Exemplar de demonstração da categoria Sociologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a3e50%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d991a6%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ESOCIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%89%A1%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAs%20Regras%20do%20M%C3%A9todo%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ESociol%C3%B3gico%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3E%C3%89mile%20Durkheim%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Sociologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-067-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-067'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Casa-Grande & Senzala', 'Gilberto Freyre', 'BOOKSHARE-068', 'Acervo BookShare', 1933, c.id, 'D-08', 'Exemplar de demonstração da categoria Sociologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a3e50%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d991a6%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ESOCIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%89%A1%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ECasa-Grande%20%26amp%3B%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ESenzala%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EGilberto%20Freyre%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Sociologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-068-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-068'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Modernidade Líquida', 'Zygmunt Bauman', 'BOOKSHARE-069', 'Acervo BookShare', 2000, c.id, 'D-09', 'Exemplar de demonstração da categoria Sociologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a3e50%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d991a6%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ESOCIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%89%A1%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EModernidade%20L%C3%ADquida%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EZygmunt%20Bauman%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Sociologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-069-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-069'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Manifesto Comunista', 'Karl Marx e Friedrich Engels', 'BOOKSHARE-070', 'Acervo BookShare', 1848, c.id, 'D-10', 'Exemplar de demonstração da categoria Sociologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%237a3e50%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d991a6%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ESOCIOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%89%A1%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Manifesto%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EComunista%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EKarl%20Marx%20e%20Friedrich%20Engels%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Sociologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-070-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-070'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A História da Arte', 'E. H. Gombrich', 'BOOKSHARE-071', 'Acervo BookShare', 1950, c.id, 'D-11', 'Exemplar de demonstração da categoria Artes. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%238a3c38%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e7a29a%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EARTES%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20Hist%C3%B3ria%20da%20Arte%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EE.%20H.%20Gombrich%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Artes'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-071-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-071'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-071-2', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-071'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Modos de Ver', 'John Berger', 'BOOKSHARE-072', 'Acervo BookShare', 1972, c.id, 'D-12', 'Exemplar de demonstração da categoria Artes. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%238a3c38%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e7a29a%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EARTES%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EModos%20de%20Ver%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJohn%20Berger%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Artes'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-072-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-072'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Que É Arte?', 'Jorge Coli', 'BOOKSHARE-073', 'Acervo BookShare', 1981, c.id, 'D-13', 'Exemplar de demonstração da categoria Artes. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%238a3c38%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e7a29a%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EARTES%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Que%20%C3%89%20Arte%3F%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EJorge%20Coli%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Artes'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-073-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-073'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Poética', 'Aristóteles', 'BOOKSHARE-074', 'Acervo BookShare', NULL, c.id, 'D-14', 'Exemplar de demonstração da categoria Artes. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%238a3c38%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e7a29a%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EARTES%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EPo%C3%A9tica%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EArist%C3%B3teles%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Artes'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-074-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-074'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'A Câmara Clara', 'Roland Barthes', 'BOOKSHARE-075', 'Acervo BookShare', 1980, c.id, 'D-15', 'Exemplar de demonstração da categoria Artes. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%238a3c38%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e7a29a%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EARTES%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%8E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EA%20C%C3%A2mara%20Clara%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERoland%20Barthes%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Artes'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-075-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-075'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Os Inovadores', 'Walter Isaacson', 'BOOKSHARE-076', 'Acervo BookShare', 2014, c.id, 'D-16', 'Exemplar de demonstração da categoria Tecnologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%231d425d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2372a9cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ETECNOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%3C%2F%3E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EOs%20Inovadores%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EWalter%20Isaacson%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Tecnologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-076-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-076'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Código', 'Charles Petzold', 'BOOKSHARE-077', 'Acervo BookShare', 1999, c.id, 'D-17', 'Exemplar de demonstração da categoria Tecnologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%231d425d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2372a9cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ETECNOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%3C%2F%3E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EC%C3%B3digo%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ECharles%20Petzold%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Tecnologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-077-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-077'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Código Limpo', 'Robert C. Martin', 'BOOKSHARE-078', 'Acervo BookShare', 2008, c.id, 'D-18', 'Exemplar de demonstração da categoria Tecnologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%231d425d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2372a9cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ETECNOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%3C%2F%3E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EC%C3%B3digo%20Limpo%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ERobert%20C.%20Martin%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Tecnologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-078-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-078'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Algoritmos', 'Thomas Cormen e colaboradores', 'BOOKSHARE-079', 'Acervo BookShare', 1990, c.id, 'D-19', 'Exemplar de demonstração da categoria Tecnologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%231d425d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2372a9cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ETECNOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%3C%2F%3E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAlgoritmos%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EThomas%20Cormen%20e%20colaboradores%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Tecnologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-079-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-079'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Inteligência Artificial: Uma Abordagem Moderna', 'Stuart Russell e Peter Norvig', 'BOOKSHARE-080', 'Acervo BookShare', 1995, c.id, 'D-20', 'Exemplar de demonstração da categoria Tecnologia. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%231d425d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2372a9cf%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3ETECNOLOGIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%3C%2F%3E%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EIntelig%C3%AAncia%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EArtificial%3A%20Uma%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EAbordagem%20Moderna%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EStuart%20Russell%20e%20Peter%20Norvig%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Tecnologia'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-080-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-080'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'O Diário de Anne Frank', 'Anne Frank', 'BOOKSHARE-081', 'Acervo BookShare', 1947, c.id, 'E-01', 'Exemplar de demonstração da categoria Biografias. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235c5136%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23cfbe7b%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOGRAFIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%99%99%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EO%20Di%C3%A1rio%20de%20Anne%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EFrank%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EAnne%20Frank%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biografias'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-081-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-081'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Longa Caminhada até a Liberdade', 'Nelson Mandela', 'BOOKSHARE-082', 'Acervo BookShare', 1994, c.id, 'E-02', 'Exemplar de demonstração da categoria Biografias. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235c5136%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23cfbe7b%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOGRAFIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%99%99%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ELonga%20Caminhada%20at%C3%A9%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Ea%20Liberdade%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3ENelson%20Mandela%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biografias'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-082-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-082'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Steve Jobs', 'Walter Isaacson', 'BOOKSHARE-083', 'Acervo BookShare', 2011, c.id, 'E-03', 'Exemplar de demonstração da categoria Biografias. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235c5136%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23cfbe7b%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOGRAFIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%99%99%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ESteve%20Jobs%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EWalter%20Isaacson%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biografias'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-083-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-083'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Minha História', 'Michelle Obama', 'BOOKSHARE-084', 'Acervo BookShare', 2018, c.id, 'E-04', 'Exemplar de demonstração da categoria Biografias. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235c5136%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23cfbe7b%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOGRAFIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%99%99%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EMinha%20Hist%C3%B3ria%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMichelle%20Obama%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biografias'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-084-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-084'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Eu Sou Malala', 'Malala Yousafzai', 'BOOKSHARE-085', 'Acervo BookShare', 2013, c.id, 'E-05', 'Exemplar de demonstração da categoria Biografias. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%235c5136%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23cfbe7b%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EBIOGRAFIAS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%99%99%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EEu%20Sou%20Malala%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMalala%20Yousafzai%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Biografias'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-085-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-085'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Maus', 'Art Spiegelman', 'BOOKSHARE-086', 'Acervo BookShare', 1986, c.id, 'E-06', 'Exemplar de demonstração da categoria Quadrinhos. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23713e7d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d395df%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQUADRINHOS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%21%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EMaus%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EArt%20Spiegelman%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Quadrinhos'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-086-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-086'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Persépolis', 'Marjane Satrapi', 'BOOKSHARE-087', 'Acervo BookShare', 2000, c.id, 'E-07', 'Exemplar de demonstração da categoria Quadrinhos. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23713e7d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d395df%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQUADRINHOS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%21%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EPers%C3%A9polis%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EMarjane%20Satrapi%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Quadrinhos'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-087-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-087'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Watchmen', 'Alan Moore e Dave Gibbons', 'BOOKSHARE-088', 'Acervo BookShare', 1987, c.id, 'E-08', 'Exemplar de demonstração da categoria Quadrinhos. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23713e7d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d395df%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQUADRINHOS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%21%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EWatchmen%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EAlan%20Moore%20e%20Dave%20Gibbons%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Quadrinhos'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-088-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-088'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Turma da Mônica: Laços', 'Vitor e Lu Cafaggi', 'BOOKSHARE-089', 'Acervo BookShare', 2013, c.id, 'E-09', 'Exemplar de demonstração da categoria Quadrinhos. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23713e7d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d395df%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQUADRINHOS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%21%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ETurma%20da%20M%C3%B4nica%3A%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ELa%C3%A7os%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EVitor%20e%20Lu%20Cafaggi%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Quadrinhos'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-089-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-089'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Daytripper', 'Fábio Moon e Gabriel Bá', 'BOOKSHARE-090', 'Acervo BookShare', 2010, c.id, 'E-10', 'Exemplar de demonstração da categoria Quadrinhos. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23713e7d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d395df%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EQUADRINHOS%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%21%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EDaytripper%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EF%C3%A1bio%20Moon%20e%20Gabriel%20B%C3%A1%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Quadrinhos'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-090-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-090'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Guia de Redação ENEM', 'Equipe Pedagógica BookShare', 'BOOKSHARE-091', 'Acervo BookShare', 2026, c.id, 'E-11', 'Exemplar de demonstração da categoria Vestibular e ENEM. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23126b5d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2377cbb8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EVESTIBULAR%20E%20ENEM%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%93%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EGuia%20de%20Reda%C3%A7%C3%A3o%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EENEM%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Vestibular e ENEM'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-091-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-091'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Matemática Essencial para o ENEM', 'Equipe Pedagógica BookShare', 'BOOKSHARE-092', 'Acervo BookShare', 2026, c.id, 'E-12', 'Exemplar de demonstração da categoria Vestibular e ENEM. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23126b5d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2377cbb8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EVESTIBULAR%20E%20ENEM%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%93%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EMatem%C3%A1tica%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EEssencial%20para%20o%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EENEM%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Vestibular e ENEM'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-092-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-092'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Ciências da Natureza em Revisão', 'Equipe Pedagógica BookShare', 'BOOKSHARE-093', 'Acervo BookShare', 2026, c.id, 'E-13', 'Exemplar de demonstração da categoria Vestibular e ENEM. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23126b5d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2377cbb8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EVESTIBULAR%20E%20ENEM%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%93%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ECi%C3%AAncias%20da%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ENatureza%20em%20Revis%C3%A3o%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Vestibular e ENEM'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-093-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-093'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Ciências Humanas em Revisão', 'Equipe Pedagógica BookShare', 'BOOKSHARE-094', 'Acervo BookShare', 2026, c.id, 'E-14', 'Exemplar de demonstração da categoria Vestibular e ENEM. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23126b5d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2377cbb8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EVESTIBULAR%20E%20ENEM%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%93%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ECi%C3%AAncias%20Humanas%20em%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ERevis%C3%A3o%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Vestibular e ENEM'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-094-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-094'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Linguagens e Literatura para Vestibulares', 'Equipe Pedagógica BookShare', 'BOOKSHARE-095', 'Acervo BookShare', 2026, c.id, 'E-15', 'Exemplar de demonstração da categoria Vestibular e ENEM. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23126b5d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2377cbb8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EVESTIBULAR%20E%20ENEM%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3E%E2%9C%93%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3ELinguagens%20e%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ELiteratura%20para%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EVestibulares%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Vestibular e ENEM'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-095-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-095'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Dicionário Escolar da Língua Portuguesa', 'Equipe Lexicográfica BookShare', 'BOOKSHARE-096', 'Acervo BookShare', 2026, c.id, 'E-16', 'Exemplar de demonstração da categoria Dicionários e Referência. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23334e68%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2393b5d1%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EDICION%C3%81RIOS%20E%20REFER%C3%8ANCIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3EA%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EDicion%C3%A1rio%20Escolar%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3Eda%20L%C3%ADngua%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EPortuguesa%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Lexicogr%C3%A1fica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Dicionários e Referência'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-096-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-096'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Atlas Geográfico Escolar', 'Equipe Geográfica BookShare', 'BOOKSHARE-097', 'Acervo BookShare', 2026, c.id, 'E-17', 'Exemplar de demonstração da categoria Dicionários e Referência. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23334e68%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2393b5d1%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EDICION%C3%81RIOS%20E%20REFER%C3%8ANCIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3EA%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EAtlas%20Geogr%C3%A1fico%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EEscolar%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Geogr%C3%A1fica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Dicionários e Referência'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-097-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-097'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Gramática de Consulta', 'Equipe Pedagógica BookShare', 'BOOKSHARE-098', 'Acervo BookShare', 2026, c.id, 'E-18', 'Exemplar de demonstração da categoria Dicionários e Referência. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23334e68%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2393b5d1%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EDICION%C3%81RIOS%20E%20REFER%C3%8ANCIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3EA%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EGram%C3%A1tica%20de%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EConsulta%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Pedag%C3%B3gica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Dicionários e Referência'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-098-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-098'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Enciclopédia de Ciências', 'Equipe Científica BookShare', 'BOOKSHARE-099', 'Acervo BookShare', 2026, c.id, 'E-19', 'Exemplar de demonstração da categoria Dicionários e Referência. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23334e68%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2393b5d1%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EDICION%C3%81RIOS%20E%20REFER%C3%8ANCIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3EA%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EEnciclop%C3%A9dia%20de%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3ECi%C3%AAncias%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Cient%C3%ADfica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Dicionários e Referência'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-099-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-099'
ON CONFLICT (inventory_code) DO NOTHING;
INSERT INTO books (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url, active)
SELECT 'Dicionário Português–Inglês', 'Equipe Lexicográfica BookShare', 'BOOKSHARE-100', 'Acervo BookShare', 2026, c.id, 'E-20', 'Exemplar de demonstração da categoria Dicionários e Referência. Capa temática gerada para o catálogo BookShare.', 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%23334e68%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2393b5d1%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2218%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%22376%22%20height%3D%22596%22%20rx%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.3%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%2268%22%20fill%3D%22white%22%20fill-opacity%3D%22.8%22%20font-family%3D%22Arial%22%20font-size%3D%2218%22%20letter-spacing%3D%222%22%3EDICION%C3%81RIOS%20E%20REFER%C3%8ANCIA%3C%2Ftext%3E%3Ctext%20x%3D%22330%22%20y%3D%22125%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%20fill-opacity%3D%22.2%22%20font-family%3D%22Georgia%22%20font-size%3D%22120%22%3EA%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22250%22%20fill%3D%22white%22%20font-family%3D%22Georgia%22%20font-size%3D%2236%22%20font-weight%3D%22700%22%3E%3Ctspan%20x%3D%2244%22%20dy%3D%220%22%3EDicion%C3%A1rio%3C%2Ftspan%3E%3Ctspan%20x%3D%2244%22%20dy%3D%2240%22%3EPortugu%C3%AAs%E2%80%93Ingl%C3%AAs%3C%2Ftspan%3E%3C%2Ftext%3E%3Cline%20x1%3D%2244%22%20y1%3D%22490%22%20x2%3D%22190%22%20y2%3D%22490%22%20stroke%3D%22white%22%20stroke-opacity%3D%22.55%22%2F%3E%3Ctext%20x%3D%2244%22%20y%3D%22530%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%20font-size%3D%2221%22%3EEquipe%20Lexicogr%C3%A1fica%20BookShare%3C%2Ftext%3E%3Ctext%20x%3D%2244%22%20y%3D%22590%22%20fill%3D%22white%22%20fill-opacity%3D%22.7%22%20font-family%3D%22Arial%22%20font-size%3D%2216%22%3EBOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR%3C%2Ftext%3E%3C%2Fsvg%3E', TRUE
FROM categories c WHERE c.name = 'Dicionários e Referência'
ON CONFLICT (isbn) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, category_id = EXCLUDED.category_id, shelf = EXCLUDED.shelf, description = EXCLUDED.description, cover_url = EXCLUDED.cover_url, active = TRUE, updated_at = NOW();
INSERT INTO book_copies (book_id, inventory_code, status, acquired_at, condition_notes)
SELECT b.id, 'BS-DEMO-100-1', 'available', CURRENT_DATE, 'Exemplar inicial do acervo' FROM books b WHERE b.isbn = 'BOOKSHARE-100'
ON CONFLICT (inventory_code) DO NOTHING;



-- As capas SVG de demonstração são removidas para que a aplicação carregue
-- automaticamente capas reais pelo Google Books, pesquisando título e autor.
UPDATE books
SET cover_url = NULL,
    updated_at = NOW()
WHERE isbn LIKE 'BOOKSHARE-%'
  AND (
    cover_url IS NULL
    OR cover_url LIKE 'data:image/svg+xml%'
    OR cover_url LIKE '%openlibrary.org%'
  );

-- Fotografias iniciais dos dois perfis.
UPDATE users
SET avatar_url = 'https://randomuser.me/api/portraits/men/32.jpg',
    updated_at = NOW()
WHERE email = 'admin@bookshare.com';

UPDATE users
SET avatar_url = 'https://randomuser.me/api/portraits/women/44.jpg',
    updated_at = NOW()
WHERE email = 'biblioteca@bookshare.com';




-- Capas reais incluídas no pacote do front-end.
UPDATE books SET cover_url = 'assets/covers/dom-casmurro.jpg', updated_at = NOW() WHERE title = 'Dom Casmurro';
UPDATE books SET cover_url = 'assets/covers/crime-e-castigo.jpg', updated_at = NOW() WHERE title = 'Crime e Castigo';
UPDATE books SET cover_url = 'assets/covers/vidas-secas.webp', updated_at = NOW() WHERE title = 'Vidas Secas';
UPDATE books SET cover_url = 'assets/covers/turma-da-monica-lacos.jpg', updated_at = NOW() WHERE title = 'Turma da Mônica: Laços';
UPDATE books SET cover_url = 'assets/covers/watchmen.jpg', updated_at = NOW() WHERE title = 'Watchmen';

COMMIT;
BEGIN;

ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_source TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_checked_at TIMESTAMPTZ;

WITH replacement_books (
  old_isbn,
  title,
  author,
  real_isbn,
  publisher,
  publication_year,
  category_name,
  description
) AS (
  VALUES
    ('BOOKSHARE-091', '1984', 'George Orwell', '9788580864458', 'Companhia das Letras', 1949, 'Literatura Estrangeira', 'Distopia clássica sobre vigilância, linguagem e autoritarismo.'),
    ('BOOKSHARE-092', 'A Revolução dos Bichos', 'George Orwell', '9788596042642', 'FTD Educação', 1945, 'Literatura Estrangeira', 'Fábula política sobre poder, revolução e autoritarismo.'),
    ('BOOKSHARE-093', 'Fahrenheit 451', 'Ray Bradbury', '9780345410016', 'Ballantine Books', 1953, 'Literatura Estrangeira', 'Romance distópico sobre censura, leitura e liberdade de pensamento.'),
    ('BOOKSHARE-094', 'O Hobbit', 'J.R.R. Tolkien', '9788595085800', 'HarperCollins Brasil', 1937, 'Literatura Estrangeira', 'A aventura de Bilbo Bolseiro pela Terra-média.'),
    ('BOOKSHARE-095', 'Quarto de Despejo', 'Carolina Maria de Jesus', '9788508196555', 'Editora Ática', 1960, 'Literatura Brasileira', 'Diário de Carolina Maria de Jesus sobre pobreza, desigualdade e resistência.'),
    ('BOOKSHARE-096', 'A Hora da Estrela', 'Clarice Lispector', '9786555950236', 'Rocco', 1977, 'Literatura Brasileira', 'Romance sobre Macabéa, identidade e desamparo social.'),
    ('BOOKSHARE-097', 'O Auto da Compadecida', 'Ariano Suassuna', '9788520942833', 'Nova Fronteira', 1955, 'Literatura Brasileira', 'Comédia teatral inspirada na cultura popular e no cordel nordestino.'),
    ('BOOKSHARE-098', 'Torto Arado', 'Itamar Vieira Junior', '9786580309320', 'Todavia', 2019, 'Literatura Brasileira', 'Romance brasileiro sobre terra, ancestralidade e desigualdade.'),
    ('BOOKSHARE-099', 'Frankenstein', 'Mary Shelley', '9786552942555', 'W. Books', 1818, 'Literatura Estrangeira', 'Clássico gótico sobre criação, responsabilidade e humanidade.'),
    ('BOOKSHARE-100', 'Drácula', 'Bram Stoker', '9788595201569', 'Pé da Letra', 1897, 'Literatura Estrangeira', 'Romance gótico que consolidou a figura moderna do vampiro.')
)
UPDATE books AS b
SET
  title = r.title,
  author = r.author,
  isbn = r.real_isbn,
  publisher = r.publisher,
  publication_year = r.publication_year,
  category_id = c.id,
  description = r.description,
  cover_url = NULL,
  cover_source = NULL,
  cover_checked_at = NULL,
  updated_at = NOW()
FROM replacement_books AS r
JOIN categories AS c
  ON c.name = r.category_name
WHERE b.isbn = r.old_isbn;

UPDATE books
SET
  cover_url = NULL,
  cover_source = NULL,
  cover_checked_at = NULL,
  updated_at = NOW()
WHERE COALESCE(cover_source, '') <> 'manual-upload';

COMMIT;

