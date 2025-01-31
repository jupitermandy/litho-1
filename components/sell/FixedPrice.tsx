import React, { useCallback, useMemo } from "react";
import Link from "next/link";

import Text from "../Text";
import Web3Context from "../Web3Context";
import Image from "next/image";
import TokenSelect from "./Select";
import Input from "../Input";
import { EnhancedTokenId } from "@cennznet/types/interfaces/nft/enhanced-token-id";
import { SupportedAssetInfo } from "../SupportedAssetsProvider";
import { isValidAddressPolkadotAddress } from "../../utils/chainHelper";
import dayjs from "dayjs";
import { BLOCK_TIME } from "../../pages/sell";
import TxStatusModal from "./TxStatusModal";

const sell = async (
  api,
  account,
  tokenId,
  buyerAddress,
  paymentAssetId,
  priceInUnit,
  duration
) => {
  const sellExtrinsic = await api.tx.nft.sell(
    tokenId,
    buyerAddress,
    paymentAssetId,
    priceInUnit,
    duration
  );

  return new Promise((resolve, reject) => {
    sellExtrinsic
      .signAndSend(account.signer, account.payload, ({ status }) => {
        if (status.isInBlock) {
          resolve(status.asInBlock.toString());
          console.log(
            `Completed at block hash #${status.asInBlock.toString()}`
          );
        }
      })
      .catch((error) => {
        console.log(":( transaction failed", error);
        reject(error);
      });
  });
};
interface Props {
  collectionId: number;
  seriesId: number;
  serialNumber: number;
  supportedAssets: SupportedAssetInfo[];
}
const FixedPrice: React.FC<Props> = ({
  collectionId,
  seriesId,
  serialNumber,
  supportedAssets,
}) => {
  const web3Context = React.useContext(Web3Context);

  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [paymentAsset, setPaymentAsset] = React.useState<SupportedAssetInfo>();

  const [modalState, setModalState] = React.useState<string>();

  React.useEffect(() => {
    if (supportedAssets && supportedAssets.length > 0) {
      setPaymentAsset(supportedAssets[0]);
    }
  }, [supportedAssets]);

  const tokenId = useMemo(() => {
    if (web3Context.api) {
      const id = new EnhancedTokenId(web3Context.api.registry, [
        collectionId,
        seriesId,
        serialNumber,
      ]);
      return id.toHex();
    }
    return undefined;
  }, [web3Context, collectionId, seriesId, serialNumber]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const { price, buyer, endDate } = e.currentTarget;

      let buyerAddress = null;
      if (buyer.value) {
        if (!isValidAddressPolkadotAddress(buyer.value)) {
          setError("Please provide a valid address");
          return;
        }
        buyerAddress = buyer.value;
      }

      const priceInUnit = +price.value * 10 ** paymentAsset.decimals;
      if (priceInUnit <= 0) {
        setError("Please provide a proper price");
        return;
      }
      let duration = null;
      if (endDate.value) {
        var dateParts = endDate.value.split("/");
        if (dateParts.length < 3) {
          setError("Please provide a valid end date");
          return;
        }
        const now = dayjs();
        const end_date = dayjs(
          new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`)
        );
        if (!end_date.isValid()) {
          setError("Please provide a valid end date");
          return;
        }
        const duration_in_sec = end_date.diff(now, "s");
        duration = duration_in_sec / BLOCK_TIME;
        if (duration <= 0) {
          setError("Please provide a future end date");
          return;
        }
      }
      if (web3Context.api) {
        try {
          setModalState("txInProgress");
          await sell(
            web3Context.api,
            web3Context.account,
            tokenId,
            buyerAddress,
            paymentAsset.id,
            priceInUnit,
            duration
          );
          setModalState("success");
        } catch (e) {
          setModalState("error");
        }
      }
    },
    [paymentAsset, web3Context.api, web3Context.account]
  );

  return (
    <>
      <form className="flex flex-col lg:w-3/5 m-auto" onSubmit={handleSubmit}>
        <div className="w-full flex flex-col m-auto">
          {error && (
            <div className="w-full bg-litho-red bg-opacity-25 text-litho-red font-bold p-2 text-base mb-4">
              {error}
            </div>
          )}

          <label>
            <Text variant="h6">Token</Text>
          </label>
          <TokenSelect
            selectedToken={paymentAsset}
            supportedAssets={supportedAssets}
            onTokenSelected={setPaymentAsset}
          />

          <label>
            <Text variant="h6">Price (in {paymentAsset?.symbol})</Text>
          </label>
          <Input
            name="price"
            type="number"
            placeholder={`Enter your price in ${paymentAsset?.symbol}`}
            min={1}
          />
          <Text variant="caption" className="w-full text-opacity-60 mb-10">
            Service fee 2.5%
          </Text>
        </div>

        <div
          className="flex item-center"
          onClick={() => setShowAdvanced((val) => !val)}
        >
          <Text variant="h5">Advanced (optional)</Text>
          <span className="ml-4 top-1">
            <Image
              src="/arrow.svg"
              height="12"
              width="12"
              className={`transform transition-transform ${
                !showAdvanced ? "rotate-180" : "rotate-0"
              }`}
            />
          </span>
        </div>

        <div
          className={`${
            showAdvanced ? "h-auto py-4" : "h-0"
          } flex flex-col overflow-hidden`}
        >
          <label>
            <Text variant="h6">Specific buyer</Text>
          </label>
          <Input
            name="buyer"
            type="text"
            placeholder="Enter a specific address that's allowed to buy it"
            className="mb-10"
          />

          <label>
            <Text variant="h6">Expiration date</Text>
          </label>
          <Input name="endDate" type="text" placeholder="DD/MM/YYYY" />
          <Text variant="caption" className="w-full text-opacity-60 mb-10">
            By default, this sale will be closed after 3 days.
          </Text>
        </div>

        <div className="w-full flex-col md:flex-row flex items-center justify-between mt-10">
          <Link
            href={`/nft/${collectionId}/${seriesId}/${serialNumber}`}
            passHref
          >
            <a className="md:w-auto border border-litho-blue bg-litho-cream text-center flex-1 py-2">
              <Text variant="button" color="litho-blue">
                CANCEL
              </Text>
            </a>
          </Link>
          <button className="md:w-auto border bg-litho-blue flex-1 mt-4 md:mt-0 md:ml-6 text-center py-2">
            <Text variant="button" color="white">
              SELL
            </Text>
          </button>
        </div>
      </form>
      {modalState && (
        <TxStatusModal
          successLink={`/nft/${collectionId}/${seriesId}/${serialNumber}`}
          errorLink={`/nft/${collectionId}/${seriesId}/${serialNumber}`}
          modalState={modalState}
          setModalState={setModalState}
        />
      )}
    </>
  );
};

export default FixedPrice;
