use anchor_lang::prelude::*;

declare_id!("7oyEmtYJmcqkG5GDQq99iM1NufFuXLwDFMCHRdmnS94t");

#[program]
pub mod anchor_escrow_interface {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
