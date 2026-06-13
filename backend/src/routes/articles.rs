use axum::{
    extract::{Path, Query, State},
    middleware,
    routing::{delete, get, post, put},
    Json, Router,
};
use validator::Validate;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::middleware::{require_auth, require_module},
    errors::{AppError, AppResult},
    AppState,
};

#[derive(Serialize, FromRow)]
pub struct Article {
    pub id:                  Uuid,
    pub name:                String,
    pub category:            Option<String>,
    pub unit:                String,
    pub min_stock:           i32,
    pub current_stock:       i32,
    pub ean:                 Option<String>,
    pub notes:               Option<String>,
    pub storage_location_id: Option<Uuid>,
    pub instance_tracking:   bool,
    pub created_at:          DateTime<Utc>,
    pub updated_at:          DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct ArticleBody {
    #[validate(length(min = 1, max = 200))]
    pub name:                String,
    #[validate(length(max = 100))]
    pub category:            Option<String>,
    #[validate(length(min = 1, max = 50))]
    pub unit:                String,
    pub min_stock:           Option<i32>,
    pub current_stock:       Option<i32>,
    #[validate(length(max = 50))]
    pub ean:                 Option<String>,
    #[validate(length(max = 2000))]
    pub notes:               Option<String>,
    pub storage_location_id: Option<Uuid>,
    pub instance_tracking:   Option<bool>,
}

// ── Chargen ──────────────────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct Charge {
    pub id:         Uuid,
    pub article_id: Uuid,
    pub charge_nr:  String,
    pub mhd:        Option<NaiveDate>,
    pub menge:      i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct ChargeBody {
    #[validate(length(min = 1, max = 100))]
    pub charge_nr: String,
    pub mhd:       Option<NaiveDate>,
    pub menge:     Option<i32>,
}

#[derive(Deserialize, Default)]
pub struct ArticleQuery {
    pub search:      Option<String>,
    pub category:    Option<String>,
    pub location_id: Option<Uuid>,
}

pub async fn list_articles(
    State(state): State<AppState>,
    Query(q): Query<ArticleQuery>,
) -> AppResult<Json<Vec<Article>>> {
    let search   = q.search.as_deref().filter(|s| !s.is_empty()).map(|s| format!("%{s}%"));
    let category = q.category.filter(|s| !s.is_empty());
    let loc_id   = q.location_id;

    // Rekursiver Teilbaum-Filter: schließt den gewählten Knoten und alle Nachfahren ein
    let rows = sqlx::query_as::<_, Article>(
        "WITH RECURSIVE subtree AS (
             SELECT id FROM storage_locations WHERE ($3::uuid IS NOT NULL AND id = $3)
             UNION ALL
             SELECT sl.id FROM storage_locations sl JOIN subtree s ON sl.parent_id = s.id
         )
         SELECT id, name, category, unit, min_stock, current_stock, ean, notes, storage_location_id, instance_tracking, created_at, updated_at
         FROM articles
         WHERE ($1::text IS NULL OR name ILIKE $1 OR category ILIKE $1)
           AND ($2::text IS NULL OR category = $2)
           AND ($3::uuid IS NULL OR storage_location_id IN (SELECT id FROM subtree))
         ORDER BY name ASC"
    )
    .bind(search)
    .bind(category)
    .bind(loc_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

pub async fn get_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Article>> {
    let row = sqlx::query_as::<_, Article>(
        "SELECT id, name, category, unit, min_stock, current_stock, ean, notes, storage_location_id, instance_tracking, created_at, updated_at
         FROM articles WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

pub async fn create_article(
    State(state): State<AppState>,
    Json(body): Json<ArticleBody>,
) -> AppResult<Json<Article>> {
    body.validate()?;
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name darf nicht leer sein".into()));
    }

    let row = sqlx::query_as::<_, Article>(
        "INSERT INTO articles (name, category, unit, min_stock, current_stock, ean, notes, storage_location_id, instance_tracking)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, category, unit, min_stock, current_stock, ean, notes, storage_location_id, instance_tracking, created_at, updated_at"
    )
    .bind(body.name.trim())
    .bind(body.category)
    .bind(body.unit)
    .bind(body.min_stock.unwrap_or(0))
    .bind(body.current_stock.unwrap_or(0))
    .bind(body.ean)
    .bind(body.notes)
    .bind(body.storage_location_id)
    .bind(body.instance_tracking.unwrap_or(false))
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

pub async fn update_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<ArticleBody>,
) -> AppResult<Json<Article>> {
    body.validate()?;
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name darf nicht leer sein".into()));
    }

    let row = sqlx::query_as::<_, Article>(
        "UPDATE articles
         SET name=$1, category=$2, unit=$3, min_stock=$4,
             current_stock=CASE WHEN instance_tracking THEN current_stock ELSE $5 END,
             ean=$6, notes=$7, storage_location_id=$8, instance_tracking=$9
         WHERE id = $10
         RETURNING id, name, category, unit, min_stock, current_stock, ean, notes, storage_location_id, instance_tracking, created_at, updated_at"
    )
    .bind(body.name.trim())
    .bind(body.category)
    .bind(body.unit)
    .bind(body.min_stock.unwrap_or(0))
    .bind(body.current_stock.unwrap_or(0))
    .bind(body.ean)
    .bind(body.notes)
    .bind(body.storage_location_id)
    .bind(body.instance_tracking.unwrap_or(false))
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

pub async fn delete_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM articles WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Artikel gelöscht" })))
}

// ── Chargen CRUD ────────────────────────────────────────────────────────────

pub async fn list_charges(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
) -> AppResult<Json<Vec<Charge>>> {
    let rows = sqlx::query_as::<_, Charge>(
        "SELECT id, article_id, charge_nr, mhd, menge, created_at
         FROM article_charges WHERE article_id = $1 ORDER BY mhd ASC NULLS LAST"
    )
    .bind(article_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

pub async fn create_charge(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
    Json(body): Json<ChargeBody>,
) -> AppResult<Json<Charge>> {
    body.validate()?;
    if body.charge_nr.trim().is_empty() {
        return Err(AppError::BadRequest("Chargennummer darf nicht leer sein".into()));
    }

    let row = sqlx::query_as::<_, Charge>(
        "INSERT INTO article_charges (article_id, charge_nr, mhd, menge)
         VALUES ($1, $2, $3, $4)
         RETURNING id, article_id, charge_nr, mhd, menge, created_at"
    )
    .bind(article_id)
    .bind(body.charge_nr.trim())
    .bind(body.mhd)
    .bind(body.menge.unwrap_or(0))
    .fetch_one(&state.db)
    .await?;

    // current_stock aktualisieren
    sqlx::query(
        "UPDATE articles SET current_stock = (
            SELECT COALESCE(SUM(menge), 0) FROM article_charges WHERE article_id = $1
         ) WHERE id = $1"
    )
    .bind(article_id)
    .execute(&state.db)
    .await?;

    Ok(Json(row))
}

pub async fn update_charge(
    State(state): State<AppState>,
    Path((article_id, charge_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ChargeBody>,
) -> AppResult<Json<Charge>> {
    body.validate()?;
    if body.charge_nr.trim().is_empty() {
        return Err(AppError::BadRequest("Chargennummer darf nicht leer sein".into()));
    }

    let row = sqlx::query_as::<_, Charge>(
        "UPDATE article_charges SET charge_nr = $1, mhd = $2, menge = $3
         WHERE id = $4 AND article_id = $5
         RETURNING id, article_id, charge_nr, mhd, menge, created_at"
    )
    .bind(body.charge_nr.trim())
    .bind(body.mhd)
    .bind(body.menge.unwrap_or(0))
    .bind(charge_id)
    .bind(article_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // current_stock aktualisieren
    sqlx::query(
        "UPDATE articles SET current_stock = (
            SELECT COALESCE(SUM(menge), 0) FROM article_charges WHERE article_id = $1
         ) WHERE id = $1"
    )
    .bind(article_id)
    .execute(&state.db)
    .await?;

    Ok(Json(row))
}

pub async fn delete_charge(
    State(state): State<AppState>,
    Path((article_id, charge_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM article_charges WHERE id = $1 AND article_id = $2")
        .bind(charge_id)
        .bind(article_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    // current_stock aktualisieren
    sqlx::query(
        "UPDATE articles SET current_stock = (
            SELECT COALESCE(SUM(menge), 0) FROM article_charges WHERE article_id = $1
         ) WHERE id = $1"
    )
    .bind(article_id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "message": "Charge gelöscht" })))
}

// ── Inspektionen CRUD ────────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct ArticleInspection {
    pub id:              Uuid,
    pub article_id:      Uuid,
    pub name:            String,
    pub last_date:       Option<NaiveDate>,
    pub next_date:       Option<NaiveDate>,
    pub interval_months: Option<i32>,
    pub notes:           Option<String>,
    pub created_at:      DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct ArticleInspectionBody {
    pub name:            String,
    pub last_date:       Option<NaiveDate>,
    pub next_date:       Option<NaiveDate>,
    pub interval_months: Option<i32>,
    pub notes:           Option<String>,
}

pub async fn list_article_inspections(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
) -> AppResult<Json<Vec<ArticleInspection>>> {
    let rows = sqlx::query_as::<_, ArticleInspection>(
        "SELECT id, article_id, name, last_date, next_date, interval_months, notes, created_at
         FROM article_inspections WHERE article_id = $1
         ORDER BY next_date ASC NULLS LAST"
    )
    .bind(article_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create_article_inspection(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
    Json(body): Json<ArticleInspectionBody>,
) -> AppResult<Json<ArticleInspection>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Bezeichnung darf nicht leer sein".into()));
    }
    let row = sqlx::query_as::<_, ArticleInspection>(
        "INSERT INTO article_inspections (article_id, name, last_date, next_date, interval_months, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, article_id, name, last_date, next_date, interval_months, notes, created_at"
    )
    .bind(article_id)
    .bind(body.name.trim())
    .bind(body.last_date)
    .bind(body.next_date)
    .bind(body.interval_months)
    .bind(body.notes)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn update_article_inspection(
    State(state): State<AppState>,
    Path((article_id, insp_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ArticleInspectionBody>,
) -> AppResult<Json<ArticleInspection>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("Bezeichnung darf nicht leer sein".into()));
    }
    let row = sqlx::query_as::<_, ArticleInspection>(
        "UPDATE article_inspections
         SET name=$1, last_date=$2, next_date=$3, interval_months=$4, notes=$5, updated_at=NOW()
         WHERE id=$6 AND article_id=$7
         RETURNING id, article_id, name, last_date, next_date, interval_months, notes, created_at"
    )
    .bind(body.name.trim())
    .bind(body.last_date)
    .bind(body.next_date)
    .bind(body.interval_months)
    .bind(body.notes)
    .bind(insp_id)
    .bind(article_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

pub async fn delete_article_inspection(
    State(state): State<AppState>,
    Path((article_id, insp_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        "DELETE FROM article_inspections WHERE id = $1 AND article_id = $2"
    )
    .bind(insp_id)
    .bind(article_id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "message": "Frist gelöscht" })))
}

// ── Einzelobjekte (Instanzen) ────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct ArticleInstance {
    pub id:                  Uuid,
    pub article_id:          Uuid,
    pub serial_number:       Option<String>,
    pub label:               Option<String>,
    pub condition:           String,
    pub storage_location_id: Option<Uuid>,
    pub notes:               Option<String>,
    pub scan_token:          Uuid,
    pub created_at:          DateTime<Utc>,
    pub updated_at:          DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct ArticleInstanceBody {
    #[validate(length(max = 128))]
    pub serial_number:       Option<String>,
    #[validate(length(max = 128))]
    pub label:               Option<String>,
    pub condition:           Option<String>,
    pub storage_location_id: Option<Uuid>,
    #[validate(length(max = 1000))]
    pub notes:               Option<String>,
}

async fn recalc_instance_stock(db: &sqlx::PgPool, article_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE articles
         SET current_stock = (
             SELECT COUNT(*) FROM article_instances
             WHERE article_id = $1 AND condition != 'ausgemustert'
         )
         WHERE id = $1 AND instance_tracking = TRUE"
    )
    .bind(article_id)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn list_article_instances(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
) -> AppResult<Json<Vec<ArticleInstance>>> {
    let rows = sqlx::query_as::<_, ArticleInstance>(
        "SELECT id, article_id, serial_number, label, condition, storage_location_id, notes, scan_token, created_at, updated_at
         FROM article_instances WHERE article_id = $1
         ORDER BY created_at ASC"
    )
    .bind(article_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create_article_instance(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
    Json(body): Json<ArticleInstanceBody>,
) -> AppResult<Json<ArticleInstance>> {
    body.validate()?;
    let condition = body.condition.as_deref().unwrap_or("gut");
    if !["gut", "in_wartung", "defekt", "ausgemustert"].contains(&condition) {
        return Err(AppError::BadRequest("Ungültiger Zustand".into()));
    }
    let row = sqlx::query_as::<_, ArticleInstance>(
        "INSERT INTO article_instances (article_id, serial_number, label, condition, storage_location_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, article_id, serial_number, label, condition, storage_location_id, notes, scan_token, created_at, updated_at"
    )
    .bind(article_id)
    .bind(body.serial_number.as_deref().filter(|s| !s.is_empty()))
    .bind(body.label.as_deref().filter(|s| !s.is_empty()))
    .bind(condition)
    .bind(body.storage_location_id)
    .bind(body.notes)
    .fetch_one(&state.db)
    .await?;
    recalc_instance_stock(&state.db, article_id).await?;
    Ok(Json(row))
}

pub async fn update_article_instance(
    State(state): State<AppState>,
    Path((article_id, instance_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ArticleInstanceBody>,
) -> AppResult<Json<ArticleInstance>> {
    body.validate()?;
    let condition = body.condition.as_deref().unwrap_or("gut");
    if !["gut", "in_wartung", "defekt", "ausgemustert"].contains(&condition) {
        return Err(AppError::BadRequest("Ungültiger Zustand".into()));
    }
    let row = sqlx::query_as::<_, ArticleInstance>(
        "UPDATE article_instances
         SET serial_number=$1, label=$2, condition=$3, storage_location_id=$4, notes=$5, updated_at=NOW()
         WHERE id=$6 AND article_id=$7
         RETURNING id, article_id, serial_number, label, condition, storage_location_id, notes, scan_token, created_at, updated_at"
    )
    .bind(body.serial_number.as_deref().filter(|s| !s.is_empty()))
    .bind(body.label.as_deref().filter(|s| !s.is_empty()))
    .bind(condition)
    .bind(body.storage_location_id)
    .bind(body.notes)
    .bind(instance_id)
    .bind(article_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    recalc_instance_stock(&state.db, article_id).await?;
    Ok(Json(row))
}

pub async fn delete_article_instance(
    State(state): State<AppState>,
    Path((article_id, instance_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        "DELETE FROM article_instances WHERE id = $1 AND article_id = $2"
    )
    .bind(instance_id)
    .bind(article_id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    recalc_instance_stock(&state.db, article_id).await?;
    Ok(Json(serde_json::json!({ "message": "Instanz gelöscht" })))
}

// ── Bestandteile / Sets ──────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct ArticleComponent {
    pub id:                Uuid,
    pub parent_article_id: Uuid,
    pub child_article_id:  Uuid,
    pub child_name:        String,
    pub child_category:    Option<String>,
    pub child_unit:        String,
    pub quantity:          i32,
}

#[derive(Deserialize, Validate)]
pub struct ArticleComponentBody {
    pub child_article_id: Uuid,
    #[validate(range(min = 1, max = 9999))]
    pub quantity: i32,
}

async fn list_article_components(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
) -> AppResult<Json<Vec<ArticleComponent>>> {
    let rows = sqlx::query_as::<_, ArticleComponent>(
        "SELECT ac.id, ac.parent_article_id, ac.child_article_id,
                a.name AS child_name, a.category AS child_category, a.unit AS child_unit,
                ac.quantity
         FROM article_components ac
         JOIN articles a ON a.id = ac.child_article_id
         WHERE ac.parent_article_id = $1
         ORDER BY ac.created_at ASC"
    )
    .bind(article_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn create_article_component(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
    Json(body): Json<ArticleComponentBody>,
) -> AppResult<Json<ArticleComponent>> {
    body.validate()?;
    if body.child_article_id == article_id {
        return Err(AppError::BadRequest("Ein Artikel kann kein Bestandteil von sich selbst sein".into()));
    }
    let row = sqlx::query_as::<_, ArticleComponent>(
        "INSERT INTO article_components (parent_article_id, child_article_id, quantity)
         VALUES ($1, $2, $3)
         RETURNING id, parent_article_id, child_article_id,
                   (SELECT name FROM articles WHERE id = $2)     AS child_name,
                   (SELECT category FROM articles WHERE id = $2) AS child_category,
                   (SELECT unit FROM articles WHERE id = $2)     AS child_unit,
                   quantity"
    )
    .bind(article_id)
    .bind(body.child_article_id)
    .bind(body.quantity)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

async fn update_article_component(
    State(state): State<AppState>,
    Path((article_id, comp_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ArticleComponentBody>,
) -> AppResult<Json<ArticleComponent>> {
    body.validate()?;
    let row = sqlx::query_as::<_, ArticleComponent>(
        "UPDATE article_components SET quantity = $1
         WHERE id = $2 AND parent_article_id = $3
         RETURNING id, parent_article_id, child_article_id,
                   (SELECT name FROM articles WHERE id = child_article_id)     AS child_name,
                   (SELECT category FROM articles WHERE id = child_article_id) AS child_category,
                   (SELECT unit FROM articles WHERE id = child_article_id)     AS child_unit,
                   quantity"
    )
    .bind(body.quantity)
    .bind(comp_id)
    .bind(article_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

async fn delete_article_component(
    State(state): State<AppState>,
    Path((article_id, comp_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        "DELETE FROM article_components WHERE id = $1 AND parent_article_id = $2"
    )
    .bind(comp_id)
    .bind(article_id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "message": "Bestandteil entfernt" })))
}

// ── EAN-Lookup ──────────────────────────────────────────────────────────────

pub async fn lookup_ean(
    State(state): State<AppState>,
    Path(ean): Path<String>,
) -> AppResult<Json<Article>> {
    let row = sqlx::query_as::<_, Article>(
        "SELECT id, name, category, unit, min_stock, current_stock, ean, notes, storage_location_id, instance_tracking, created_at, updated_at
         FROM articles WHERE ean = $1"
    )
    .bind(ean.trim())
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

// ── Mindestbestand-Alarm ────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct LowStockArticle {
    pub id:            Uuid,
    pub name:          String,
    pub category:      Option<String>,
    pub unit:          String,
    pub min_stock:     i32,
    pub current_stock: i32,
}

pub async fn low_stock(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<LowStockArticle>>> {
    let rows = sqlx::query_as::<_, LowStockArticle>(
        "SELECT id, name, category, unit, min_stock, current_stock
         FROM articles WHERE current_stock < min_stock AND min_stock > 0
         ORDER BY (current_stock - min_stock) ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

// ── Einheiten ───────────────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct Unit {
    pub id:    i32,
    pub label: String,
}

pub async fn list_units(State(state): State<AppState>) -> AppResult<Json<Vec<Unit>>> {
    let rows = sqlx::query_as::<_, Unit>("SELECT id, label FROM units ORDER BY id ASC")
        .fetch_all(&state.db)
        .await?;

    Ok(Json(rows))
}

// ── Artikel-Kategorien CRUD ───────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct ArticleCategory {
    pub id:         Uuid,
    pub label:      String,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub used_count: i64,
}

#[derive(Deserialize, Validate)]
pub struct ArticleCategoryBody {
    #[validate(length(min = 1, max = 100))]
    pub label:      String,
    pub sort_order: Option<i32>,
}

pub async fn list_article_categories(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<ArticleCategory>>> {
    let rows = sqlx::query_as::<_, ArticleCategory>(
        "SELECT ac.id, ac.label, ac.sort_order, ac.created_at, COUNT(a.id) AS used_count
         FROM article_categories ac
         LEFT JOIN articles a ON a.category = ac.label
         GROUP BY ac.id
         ORDER BY ac.sort_order ASC, ac.label ASC"
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create_article_category(
    State(state): State<AppState>,
    Json(body): Json<ArticleCategoryBody>,
) -> AppResult<Json<ArticleCategory>> {
    body.validate()?;
    let label = body.label.trim().to_string();
    if label.is_empty() {
        return Err(AppError::BadRequest("Bezeichnung darf nicht leer sein".into()));
    }
    let row = sqlx::query_as::<_, ArticleCategory>(
        "INSERT INTO article_categories (label, sort_order)
         VALUES ($1, $2)
         RETURNING id, label, sort_order, created_at, 0::bigint AS used_count"
    )
    .bind(&label)
    .bind(body.sort_order.unwrap_or(0))
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("unique") {
            AppError::BadRequest(format!("Kategorie '{}' existiert bereits", label))
        } else {
            AppError::Database(e)
        }
    })?;
    Ok(Json(row))
}

pub async fn update_article_category(
    State(state): State<AppState>,
    Path(cat_id): Path<Uuid>,
    Json(body): Json<ArticleCategoryBody>,
) -> AppResult<Json<ArticleCategory>> {
    body.validate()?;
    let new_label = body.label.trim().to_string();
    if new_label.is_empty() {
        return Err(AppError::BadRequest("Bezeichnung darf nicht leer sein".into()));
    }
    let old_label: Option<String> = sqlx::query_scalar(
        "SELECT label FROM article_categories WHERE id = $1"
    )
    .bind(cat_id)
    .fetch_optional(&state.db)
    .await?;
    let old_label = old_label.ok_or(AppError::NotFound)?;

    let row = sqlx::query_as::<_, ArticleCategory>(
        "UPDATE article_categories SET label = $1, sort_order = $2
         WHERE id = $3
         RETURNING id, label, sort_order, created_at, 0::bigint AS used_count"
    )
    .bind(&new_label)
    .bind(body.sort_order.unwrap_or(0))
    .bind(cat_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    if old_label != new_label {
        sqlx::query("UPDATE articles SET category = $1 WHERE category = $2")
            .bind(&new_label)
            .bind(&old_label)
            .execute(&state.db)
            .await?;
    }
    Ok(Json(row))
}

pub async fn delete_article_category(
    State(state): State<AppState>,
    Path(cat_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM article_categories WHERE id = $1")
        .bind(cat_id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "message": "Kategorie gelöscht" })))
}

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_articles).post(create_article))
        .route("/:id", get(get_article).put(update_article).delete(delete_article))
        .route("/:id/charges", get(list_charges).post(create_charge))
        .route("/:id/charges/:charge_id", put(update_charge).delete(delete_charge))
        .route("/:id/inspections", get(list_article_inspections).post(create_article_inspection))
        .route("/:id/inspections/:insp_id", put(update_article_inspection).delete(delete_article_inspection))
        .route("/:id/instances", get(list_article_instances).post(create_article_instance))
        .route("/:id/instances/:instance_id", put(update_article_instance).delete(delete_article_instance))
        .route("/:id/components", get(list_article_components).post(create_article_component))
        .route("/:id/components/:comp_id", put(update_article_component).delete(delete_article_component))
        .route("/ean/:ean", get(lookup_ean))
        .route("/low-stock", get(low_stock))
        .route("/units", get(list_units))
        .route("/categories", get(list_article_categories).post(create_article_category))
        .route("/categories/:cat_id", put(update_article_category).delete(delete_article_category))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("lager")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}

// ── Scan-Daten (auth-geschützt, JSON) ────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct ScanData {
    pub article_name:     String,
    pub article_category: Option<String>,
    pub serial_number:    Option<String>,
    pub label:            Option<String>,
    pub condition:        String,
    pub location_name:    Option<String>,
    pub next_inspection:  Option<NaiveDate>,
}

pub async fn get_scan_data(
    State(state): State<AppState>,
    Path(token): Path<Uuid>,
) -> AppResult<Json<ScanData>> {
    let row = sqlx::query_as::<_, ScanData>(
        "SELECT
            a.name            AS article_name,
            a.category        AS article_category,
            i.serial_number,
            i.label,
            i.condition,
            sl.name           AS location_name,
            (SELECT MIN(next_date) FROM article_inspections
             WHERE article_id = a.id AND next_date >= CURRENT_DATE) AS next_inspection
         FROM article_instances i
         JOIN articles a ON a.id = i.article_id
         LEFT JOIN storage_locations sl ON sl.id = i.storage_location_id
         WHERE i.scan_token = $1"
    )
    .bind(token)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

pub fn scan_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/scan/:token", get(get_scan_data))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state)
}
