#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
mod instructions;
mod state;
mod errors;
use instructions::*;

declare_id!("7oyEmtYJmcqkG5GDQq99iM1NufFuXLwDFMCHRdmnS94t");

#[program]
pub mod anchor_escrow_interface {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, amount_receive: u64, amount_transfer: u64) -> Result<()> {
        ctx.accounts.init_escrow(seed, amount_receive, &ctx.bumps)?;
        ctx.accounts.make(amount_transfer)?;
        Ok(())
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.transfer_to_maker()?;
        ctx.accounts.transfer_to_taker()?;
        ctx.accounts.close_vault()?;
        Ok(())
    }



}

