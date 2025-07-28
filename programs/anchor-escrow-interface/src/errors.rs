use anchor_lang::error_code;

#[error_code]
pub enum EscrowError {
    #[msg("Invalid token program")]
    InvalidTokenProgram,
}