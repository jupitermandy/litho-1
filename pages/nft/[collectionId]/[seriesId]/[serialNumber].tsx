import React, { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import Web3Context from "../../../../components/Web3Context";
import Text from "../../../../components/Text";
import getFileExtension from "../../../../utils/getFileExtension";
import isImageOrVideo from "../../../../utils/isImageOrVideo";
import SupportedAssetsContext from "../../../../components/SupportedAssetsContext";
import TxStatusModal from "../../../../components/sell/TxStatusModal";
import { GetRemaindedTime } from "../../../../utils/chainHelper";
import Input from "../../../../components/Input";

const buyWithFixedPrice = async (api, account, listingId) => {
  const buyExtrinsic = await api.tx.nft.buy(listingId);

  return new Promise((resolve, reject) => {
    buyExtrinsic
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

const placeABid = async (api, account, listingId, amount) => {
  const extrinsic = await api.tx.nft.bid(listingId, amount);

  return new Promise((resolve, reject) => {
    extrinsic
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

const NFTDetail: React.FC<{}> = () => {
  const router = useRouter();
  const supportedAssetContext = React.useContext(SupportedAssetsContext);

  const supportedAssets = useMemo(() => {
    return supportedAssetContext.supportedAssets;
  }, [supportedAssetContext]);

  const [loading, setLoading] = React.useState(true);
  const web3Context = React.useContext(Web3Context);
  const [nft, setNFT] = React.useState<{ [index: string]: any }>();
  const [image, setImage] = React.useState<string>();
  const [extension, setFileExtension] = React.useState<string>();
  const [isPlaceABid, setIsPlaceABid] = React.useState<boolean>(false);
  const [modalState, setModalState] = React.useState<string>();
  const [currentBlock, setCurrentBlock] = React.useState<number>();
  const [error, setError] = React.useState(null);
  const [editableSerialNumber, setEditableSerialNumber] =
    React.useState<number>(undefined);

  React.useEffect(() => {
    if (!web3Context.api) {
      return;
    }
    (async () => {
      web3Context.api.isReady.then(async () => {
        const tokenInfo = await web3Context.api.derive.nft.tokenInfo({
          collectionId: router.query.collectionId,
          seriesId: router.query.seriesId,
          serialNumber: router.query.serialNumber,
        });

        const currentBlock = (
          await web3Context.api.rpc.chain.getBlock()
        ).block.header.number.toNumber();
        setCurrentBlock(Number(currentBlock));

        const seriesIssuance = await web3Context.api.query.nft.seriesIssuance(
          router.query.collectionId,
          router.query.seriesId
        );

        const [openListing, tokenOwner] = await Promise.all([
          web3Context.api.derive.nft.openCollectionListings(
            router.query.collectionId
          ),
          web3Context.api.query.nft.tokenOwner(
            [router.query.collectionId, router.query.seriesId],
            router.query.serialNumber
          ),
        ]);

        const { attributes, owner, tokenId } = tokenInfo;
        const listingInfo = openListing.find((listing) => {
          return (
            listing.tokenId.collectionId.toNumber() ===
              tokenId.collectionId.toNumber() &&
            listing.tokenId.seriesId.toNumber() ===
              tokenId.seriesId.toNumber() &&
            listing.tokenId.serialNumber.toNumber() ===
              tokenId.serialNumber.toNumber()
          );
        });
        let auctionInfo = undefined;
        let fixedPriceInfo = undefined;

        if (listingInfo) {
          const listing = (
            await web3Context.api.query.nft.listings(listingInfo.listingId)
          ).unwrapOrDefault();
          if (listing.isAuction) {
            auctionInfo = listing.asAuction.toJSON();
          } else {
            fixedPriceInfo = listing.asFixedPrice.toJSON();
          }
        }
        const nft: { [index: string]: any } = {
          collectionId: router.query.collectionId,
          seriesId: router.query.seriesId,
          serialNumber: router.query.serialNumber,
          owner,
          copies: seriesIssuance.toJSON(),
          listingId: listingInfo?.listingId.toNumber(),
          auctionInfo: auctionInfo,
          fixedPriceInfo: fixedPriceInfo,
        };

        const otherAttributes = [];

        attributes.forEach(({ Text, Url }) => {
          const attributeString = Text || Url;
          if (attributeString) {
            const attributeBreakup = attributeString.split(" ");
            switch (attributeBreakup[0]) {
              case "Image-URL":
                nft.image = attributeBreakup[1];
                break;
              case "Metadata-URL":
                nft.metadata = attributeBreakup[1];
                break;
              case "Title":
                const [_, ...words] = attributeBreakup;
                nft.title = words.join(" ");
              case "Description":
                const [, ...description] = attributeBreakup;
                nft.description = description.join(" ");
                break;
              case "File-Type":
                const [, ...fileType] = attributeBreakup;
                nft.fileType = fileType;
                break;
              case "Quantity":
                break;
              case "Video-URL":
                const [, video] = attributeBreakup;
                nft.videoUrl = video;
                break;
              default:
                otherAttributes.push(attributeString);
                break;
            }
          }
        });
        nft.attributes = otherAttributes;
        setNFT(nft);

        let imageUrl;
        const image = nft.coverImage || nft.image;
        const fileExtension = getFileExtension(image);

        if (!fileExtension) {
          imageUrl = "/litho-default.jpg";
        } else {
          if (typeof image === "object") {
            imageUrl = URL.createObjectURL(image);
          } else {
            imageUrl = image;
          }
        }
        setFileExtension(fileExtension);
        setImage(imageUrl);
        setLoading(false);
      });
    })();
  }, [
    web3Context.api,
    router.query.collectionId,
    router.query.seriesId,
    router.query.serialNumber,
  ]);

  useEffect(() => {
    if (!web3Context.api || !web3Context.account) {
      return;
    }
    (async () => {
      web3Context.api.isReady.then(async () => {
        const copies = await web3Context.api.query.nft.seriesIssuance(
          router.query.collectionId,
          router.query.seriesId
        );

        let copyParams = [];
        if (router.query.serialNumber === "0") {
          for (let i = 0; i < copies.toNumber(); i++) {
            copyParams.push([
              [router.query.collectionId, router.query.seriesId],
              i,
            ]);
          }
        } else {
          copyParams.push([
            [router.query.collectionId, router.query.seriesId],
            router.query.serialNumber,
          ]);
        }
        const [copyOwers, openListing] = await Promise.all([
          web3Context.api.query.nft.tokenOwner.multi(copyParams),
          web3Context.api.derive.nft.openCollectionListings(
            router.query.collectionId
          ),
        ]);
        for (let i = 0; i < copies.toNumber(); i++) {
          const isOwner =
            copyOwers[i].toString() === web3Context.account.address.toString();
          const isOnSale = openListing.find((listing) => {
            return (
              listing.tokenId.collectionId.toNumber() ===
                Number(router.query.collectionId) &&
              listing.tokenId.seriesId.toNumber() ===
                Number(router.query.seriesId) &&
              listing.tokenId.serialNumber.toNumber() === i
            );
          });
          if (isOwner && !isOnSale) {
            setEditableSerialNumber(i);
            break;
          }
        }
      });
    })();
  }, [web3Context.api, web3Context.account]);

  const paymentAsset = useMemo(() => {
    let paymentAssetId = undefined;
    if (nft && nft.fixedPriceInfo) {
      paymentAssetId = nft.fixedPriceInfo.paymentAsset;
    }
    if (nft && nft.auctionInfo) {
      paymentAssetId = nft.auctionInfo.paymentAsset;
    }
    if (supportedAssets && supportedAssets.length > 0 && paymentAssetId) {
      return supportedAssets.find((asset) => asset.id === paymentAssetId);
    }
  }, [nft, supportedAssets]);

  const reservePrice = useMemo(() => {
    if (nft && nft.auctionInfo && paymentAsset) {
      const price = nft.auctionInfo.reservePrice;
      return price / 10 ** paymentAsset.decimals;
    }
    return 0;
  }, [nft, paymentAsset]);

  const fixedPrice = useMemo(() => {
    if (nft && nft.fixedPriceInfo && paymentAsset) {
      const price = nft.fixedPriceInfo.fixedPrice;
      return price / 10 ** paymentAsset.decimals;
    }
    return 0;
  }, [nft, paymentAsset]);

  const endTime = useMemo(() => {
    if (nft && web3Context.api) {
      let blocks = 0;
      if (nft.fixedPriceInfo) {
        blocks = Number(nft.fixedPriceInfo.close) - currentBlock;
        return GetRemaindedTime(web3Context.api, blocks);
      }
      if (nft.auctionInfo) {
        blocks = Number(nft.auctionInfo.close) - currentBlock;
        return GetRemaindedTime(web3Context.api, blocks);
      }
    }
  }, [nft, web3Context.api, currentBlock]);

  const buyNow = useCallback(
    async (e) => {
      e.preventDefault();
      if (web3Context.api && nft && nft.listingId) {
        try {
          setModalState("txInProgress");
          await buyWithFixedPrice(
            web3Context.api,
            web3Context.account,
            nft.listingId
          );
          setModalState("success");
        } catch (e) {
          setModalState("error");
        }
      }
    },
    [nft, web3Context.api, web3Context.account]
  );

  const confirmBid = useCallback(
    async (e) => {
      e.preventDefault();
      const { price } = e.currentTarget;

      if (
        !price.value ||
        !paymentAsset ||
        !nft ||
        !nft.auctionInfo ||
        !nft.listingId
      ) {
        return;
      }

      const priceInUnit = +price.value * 10 ** paymentAsset.decimals;

      if (web3Context.api) {
        try {
          setModalState("txInProgress");
          await placeABid(
            web3Context.api,
            web3Context.account,
            nft.listingId,
            priceInUnit
          );
          setModalState("success");
        } catch (e) {
          console.log(":( transaction failed", e);
          setModalState("error");
        }
      }
    },
    [paymentAsset, nft, web3Context.api, reservePrice, web3Context.account]
  );

  return (
    <>
      <Link href="/me">
        <a className="font-bold" style={{ lineHeight: "31px" }}>
          &lt; My Profile
        </a>
      </Link>
      {image ? (
        <div className="border border-litho-black mt-7 mb-6 flex flex-col h-full">
          <div className="border-b border-litho-black px-10 py-5 flex items-center">
            <Text variant="h3" component="h3" className="flex-1">
              {nft.title}
            </Text>
            {nft.fileType && (
              <Text variant="h6" className="mr-8">
                File Type:{" "}
                <span className="text-litho-black text-opacity-50">
                  {nft.fileType}
                </span>
              </Text>
            )}
            <Text variant="h6">
              Copies:{" "}
              <span className="text-litho-black text-opacity-50">
                {nft.copies}
              </span>
            </Text>
          </div>
          <div className="flex">
            <div className="w-2/3 border-r border-litho-black">
              <div
                className="border-b border-litho-black flex items-center justify-center"
                style={{ minHeight: "500px", maxHeight: "499px" }}
              >
                {nft.videoUrl ? (
                  <video
                    src={nft.videoUrl}
                    height="300"
                    controls
                    autoPlay
                    width="300"
                    loop
                    controlsList="nodownload"
                    className="object-contain object-center w-full bg-litho-black bg-no-repeat bg-center"
                  />
                ) : (
                  <img
                    src={image}
                    className="object-contain object-center bg-image-loading bg-no-repeat bg-center"
                    onLoad={(event) => {
                      if (event.target) {
                        (event.target as HTMLImageElement).classList.remove(
                          "bg-image-loading"
                        );
                      }
                    }}
                    onError={(event) => {
                      (event.target as HTMLImageElement).src =
                        "/litho-default.jpg";
                      (event.target as HTMLImageElement).style.height = "499px";
                    }}
                    style={{ maxHeight: "499px" }}
                  />
                )}
              </div>
              <div className="p-5 flex items-center justify-around">
                <Link href={nft.image}>
                  <a
                    className="text-litho-blue font-medium text-lg underline"
                    target="_blank"
                  >
                    View on IPFS
                  </a>
                </Link>
                <Link href={nft.metadata}>
                  <a
                    className="text-litho-blue font-medium text-lg underline"
                    target="_blank"
                  >
                    IPFS Metadata
                  </a>
                </Link>
              </div>
            </div>
            <div className="w-1/3">
              {!isPlaceABid ? (
                <>
                  {nft.listingId && (nft.auctionInfo || nft.fixedPriceInfo) && (
                    <div className="w-full p-8 flex flex-col border-b border-litho-black">
                      {nft.fixedPriceInfo && (
                        <>
                          <div className="flex justify-between">
                            <Text variant="h6" className="text-opacity-50">
                              Fixed Price
                            </Text>
                            <Text variant="h6">
                              {endTime &&
                                `Ending in ${endTime.days} days ${endTime.hours} hours`}
                            </Text>
                          </div>
                          <div className="flex justify-between">
                            <Text variant="h3" className="mt-6">
                              {fixedPrice} {paymentAsset?.symbol}
                            </Text>
                          </div>
                        </>
                      )}
                      {nft.auctionInfo && (
                        <>
                          <div className="flex justify-between">
                            <Text variant="h6" className="text-opacity-50">
                              Live Auction
                            </Text>
                            <Text variant="h6">
                              {endTime &&
                                `Ending in ${endTime.days} days ${endTime.hours} hours`}
                            </Text>
                          </div>
                          <Text variant="h3" className="mt-6">
                            {reservePrice} {paymentAsset?.symbol}
                          </Text>
                        </>
                      )}
                      {nft.auctionInfo && (
                        <div className="w-full flex-col md:flex-row flex items-center justify-between mt-4">
                          <button
                            className="md:w-auto border bg-litho-blue flex-1 mt-4 md:mt-0 text-center py-2"
                            onClick={() => setIsPlaceABid(true)}
                          >
                            <Text variant="button" color="white">
                              PLACE A BID
                            </Text>
                          </button>
                        </div>
                      )}
                      {nft.fixedPriceInfo && (
                        <div className="w-full flex-col md:flex-row flex items-center justify-between mt-10">
                          <button
                            className="md:w-auto border bg-litho-blue flex-1 mt-4 md:mt-0 text-center py-2"
                            onClick={buyNow}
                          >
                            <Text variant="button" color="white">
                              BUY NOW
                            </Text>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="w-full p-8 flex flex-col border-b border-litho-black">
                    <Text variant="h6">Creator</Text>
                    <Text variant="h6" className="text-opacity-50">
                      {nft.owner.substr(0, 8)}...{nft.owner.substr(-8)}{" "}
                      {web3Context.account
                        ? web3Context.account.address === nft.owner
                          ? "(You)"
                          : null
                        : null}
                    </Text>
                    {editableSerialNumber !== undefined && (
                      <div className="w-full flex-col md:flex-row flex items-center justify-between mt-10">
                        <Link href="#" passHref>
                          <a className="w-full md:w-auto border bg-litho-blue flex-1 mt-4 md:mt-0 text-center py-2">
                            <Text variant="button" color="white">
                              EDIT
                            </Text>
                          </a>
                        </Link>
                        <Link
                          href={`/sell?collectionId=${router.query.collectionId}&seriesId=${router.query.seriesId}&serialNumber=${editableSerialNumber}`}
                        >
                          <a className="w-full md:w-auto border bg-litho-blue flex-1 mt-4 md:mt-0 md:ml-6 text-center py-2">
                            <Text variant="button" color="white">
                              SELL
                            </Text>
                          </a>
                        </Link>
                      </div>
                    )}
                  </div>
                  {nft.description && (
                    <div className="w-full p-8 flex flex-col border-b border-litho-black">
                      <Text variant="h6">Description</Text>
                      <Text
                        variant="body2"
                        className="text-opacity-50 break-all"
                      >
                        {nft.description}
                      </Text>
                    </div>
                  )}
                  {nft.attributes.length > 0 && (
                    <div className="w-full p-8 flex flex-col border-b border-litho-black">
                      <Text variant="h6">Attributes</Text>
                      {nft.attributes.map((attribute) => {
                        if (!attribute) {
                          return null;
                        }
                        return (
                          <Text
                            variant="body1"
                            className="text-opacity-50 break-all my-2"
                            key={attribute}
                          >
                            {attribute}
                          </Text>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full p-8 flex flex-col border-b border-litho-black">
                  <div className="flex justify-between">
                    <Text variant="h6" className="text-opacity-50">
                      Live Auction
                    </Text>
                    <Text variant="h6">
                      {endTime &&
                        `Ending in ${endTime.days} days ${endTime.hours} hours`}
                    </Text>
                  </div>
                  <form onSubmit={confirmBid}>
                    <div className="w-full flex flex-col m-auto mt-10">
                      <Text variant="h3" className="mb-6">
                        Enter a bid
                      </Text>
                      <Input
                        name="price"
                        type="number"
                        placeholder={`Minimum bid of ${reservePrice} ${paymentAsset?.symbol}`}
                        min={+reservePrice}
                      />
                      <Text
                        variant="caption"
                        className="w-full text-opacity-60 mt-10 mb-10"
                      >
                        Once a bid is placed it cant be withdrawn, additional Ts
                        andCs here Lorem ipsum dolor sit amet, consectetur
                        adipiscing elit, sed do eiusmod tempor incididunt ut
                        labore et dolore magna aliqua.
                      </Text>
                    </div>
                    <div className="w-full flex-col md:flex-row flex items-center justify-between mt-10">
                      <button
                        className="w-full md:w-auto border border-litho-blue bg-litho-cream flex-1 mt-4 md:mt-0 text-center py-2"
                        onClick={() => setIsPlaceABid(false)}
                      >
                        <Text variant="button" color="litho-blue">
                          CANCEL
                        </Text>
                      </button>
                      <button className="w-full md:w-auto border bg-litho-blue flex-1 mt-4 md:mt-0 md:ml-6 text-center py-2">
                        <Text variant="button" color="white">
                          CONFIRM BID
                        </Text>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : !loading ? (
        <div className="border border-litho-black h-customScreen flex items-center justify-center text-4xl text-litho-black text-opacity-50">
          Could not load NFT
        </div>
      ) : null}
      {modalState && (
        <TxStatusModal
          successLink={`/marketplace`}
          errorLink={"/marketplace"}
          modalState={modalState}
          setModalState={setModalState}
        />
      )}
    </>
  );
};

export default NFTDetail;
