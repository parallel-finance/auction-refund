import { SubstrateExtrinsic } from "@subql/types";
import { Extrinsic } from "@polkadot/types/interfaces";
import { Vec } from "@polkadot/types";
import { RefundAction } from "../types";

const MULTISIG_ADDR = "13wNbioJt44NKrcQ5ZUrshJqP7TKzQbzZt5nhkeL4joa3PAX";
const REFUND_ADDR = "14auZo7SiRJUjnWoQdQJkQEFdy6KRF7xnyWRj91mxhPZKN4F";

const parseRemark = (remark: { toString: () => string }) => {
  logger.info(`Remark is ${remark.toString()}`);
  return Buffer.from(remark.toString().slice(2), "hex").toString("utf8");
};

const checkTransaction = (sectionFilter: string, methodFilter: string, call: Extrinsic) => {
  const { section, method } = api.registry.findMetaCall(call.callIndex);
  return section === sectionFilter && method === methodFilter;
};

const handleRefund = async (calls: Vec<Extrinsic>, blockHeight: number, hash: string) => {
  const [
    {
      args: [signatureRaw],
    },
    {
      args: [accountRaw],
    },
  ] = calls.toArray();
  const record = RefundAction.create({
    id: hash,
    blockHeight,
    account: accountRaw.toString(),
    kind: "withdraw",
    signature: parseRemark(signatureRaw),
  });

  await record.save();
};

const handleReinvest = async (calls: Vec<Extrinsic>, blockHeight: number, hash: string) => {
  const {
    args: [infoRaw],
  } = calls.toArray()[2];
  const [account, signature] = parseRemark(infoRaw).split("#");
  const record = RefundAction.create({
    id: hash,
    blockHeight,
    account: account,
    kind: "reinvest",
    signature,
  });

  await record.save();
};
export const handleAuctionRefundActions = async (extrinsic: SubstrateExtrinsic) => {
  const calls = extrinsic.extrinsic.args[0] as Vec<Extrinsic>;

  // Check signer
  if (extrinsic.extrinsic.signer.toString() !== REFUND_ADDR) {
    return;
  }

  // Refund
  // batchAll {
  //  remark(signature)
  //  transfer(account, amount)
  // }
  if (
    calls.length === 2 &&
    checkTransaction("system", "remark", calls[0]) &&
    checkTransaction("balances", "transfer", calls[1])
  ) {
    await handleRefund(calls, extrinsic.block.block.header.number.toNumber(), extrinsic.extrinsic.hash.toString());
  }

  // Reinvest
  // batchAll {
  //  remark(paraid#referralCode)
  //  transfer(MULTISIG_ADDR, amount)
  //  remark(account#signature)
  // }
  if (
    calls.length === 3 &&
    checkTransaction("system", "remark", calls[0]) &&
    checkTransaction("balances", "transfer", calls[1]) &&
    checkTransaction("system", "remark", calls[2])
  ) {
    await handleReinvest(calls, extrinsic.block.block.header.number.toNumber(), extrinsic.extrinsic.hash.toString());
  }
};
