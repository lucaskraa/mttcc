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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_lowercase
    CHECK (email = LOWER(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (LOWER(email));

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

COMMIT;

