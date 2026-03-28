'use client';

import Cropper, { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationPickerMap, type LocationValue } from '@/components/layout/location-picker-map';
import { DeviceDto } from '@/types/device';

type DashboardOverlaysProps = {
  isDeletePopupOpen: boolean;
  isEditDevicePopupOpen: boolean;
  isAddDevicePopupOpen: boolean;
  imageSrc: string | null;
  selectedDevice: DeviceDto | null;
  isSubmittingDeviceAction: boolean;
  editDeviceName: string;
  editDeviceLatitude: string;
  editDeviceLongitude: string;
  editLocation: LocationValue | null;
  macAddress: string;
  isMacValid: boolean;
  addDeviceLatitude: string;
  addDeviceLongitude: string;
  addLocation: LocationValue | null;
  canSubmitAddDevice: boolean;
  isUploading: boolean;
  crop: { x: number; y: number };
  zoom: number;
  onSetImageSrc: (value: string | null) => void;
  onCloseDeletePopup: () => void;
  onConfirmDeleteDevice: () => void;
  onCloseEditPopup: () => void;
  onEditDeviceNameChange: (value: string) => void;
  onEditDeviceLatitudeChange: (value: string) => void;
  onEditDeviceLongitudeChange: (value: string) => void;
  onEditLocationChange: (location: LocationValue) => void;
  onSaveDeviceChanges: () => void;
  onCloseAddPopup: () => void;
  onMacAddressChange: (value: string) => void;
  onAddLatitudeChange: (value: string) => void;
  onAddLongitudeChange: (value: string) => void;
  onAddLocationChange: (location: LocationValue) => void;
  onAddDevice: () => void;
  onSetCrop: (next: { x: number; y: number }) => void;
  onSetZoom: (next: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onSaveCroppedImage: () => void;
};

export default function DashboardOverlays({
  isDeletePopupOpen,
  isEditDevicePopupOpen,
  isAddDevicePopupOpen,
  imageSrc,
  selectedDevice,
  isSubmittingDeviceAction,
  editDeviceName,
  editDeviceLatitude,
  editDeviceLongitude,
  editLocation,
  macAddress,
  isMacValid,
  addDeviceLatitude,
  addDeviceLongitude,
  addLocation,
  canSubmitAddDevice,
  isUploading,
  crop,
  zoom,
  onSetImageSrc,
  onCloseDeletePopup,
  onConfirmDeleteDevice,
  onCloseEditPopup,
  onEditDeviceNameChange,
  onEditDeviceLatitudeChange,
  onEditDeviceLongitudeChange,
  onEditLocationChange,
  onSaveDeviceChanges,
  onCloseAddPopup,
  onMacAddressChange,
  onAddLatitudeChange,
  onAddLongitudeChange,
  onAddLocationChange,
  onAddDevice,
  onSetCrop,
  onSetZoom,
  onCropComplete,
  onSaveCroppedImage,
}: DashboardOverlaysProps) {
  return (
    <>
      {isDeletePopupOpen && selectedDevice && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-slate-900">Delete Device</h4>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete {selectedDevice.name} ({selectedDevice.mac})?
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCloseDeletePopup}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDeleteDevice}
                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                disabled={isSubmittingDeviceAction}
              >
                {isSubmittingDeviceAction ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditDevicePopupOpen && selectedDevice && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Edit Device</h2>
            <p className="mt-2 text-sm text-slate-600">Update device basic information and location.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Device Name</label>
                <Input value={editDeviceName} onChange={(event) => onEditDeviceNameChange(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Latitude</label>
                  <Input value={editDeviceLatitude} onChange={(event) => onEditDeviceLatitudeChange(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Longitude</label>
                  <Input value={editDeviceLongitude} onChange={(event) => onEditDeviceLongitudeChange(event.target.value)} />
                </div>
              </div>

              <div>
                <p className="mb-1 block text-sm font-semibold text-slate-700">Pick Location on Map</p>
                <LocationPickerMap
                  className="h-52 w-full rounded-xl border border-slate-200"
                  value={editLocation}
                  onChange={onEditLocationChange}
                />
                <p className="mt-1 text-xs text-slate-500">Click map to set new device location.</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onCloseEditPopup}
                disabled={isSubmittingDeviceAction}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onSaveDeviceChanges}
                disabled={isSubmittingDeviceAction}
              >
                {isSubmittingDeviceAction ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAddDevicePopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Add New Device</h2>
            <p className="mt-2 text-sm text-slate-600">Complete both steps to enable Add Device.</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 1</p>
                <label htmlFor="dashboard-mac-address" className="mb-1 mt-2 block text-sm font-semibold text-slate-700">
                  MAC Address
                </label>
                <Input
                  id="dashboard-mac-address"
                  type="text"
                  value={macAddress}
                  onChange={(event) => onMacAddressChange(event.target.value)}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  maxLength={17}
                  className={macAddress && !isMacValid ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25' : ''}
                />
                {macAddress && !isMacValid && (
                  <p className="mt-1 text-xs text-rose-600">Invalid MAC format. Use 12 letters/numbers, grouped as AA:BB:CC:DD:EE:FF.</p>
                )}
                <p className="mt-1 text-xs text-slate-500">You only type letters/numbers, the : separator is added automatically every 2 characters.</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 2</p>
                <p className="mb-2 mt-2 text-sm font-semibold text-slate-700">Pick Device Location</p>
                <LocationPickerMap
                  className="h-52 w-full rounded-xl border border-slate-200"
                  value={addLocation}
                  onChange={onAddLocationChange}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    value={addDeviceLatitude}
                    onChange={(event) => onAddLatitudeChange(event.target.value)}
                    placeholder="Latitude"
                  />
                  <Input
                    value={addDeviceLongitude}
                    onChange={(event) => onAddLongitudeChange(event.target.value)}
                    placeholder="Longitude"
                  />
                </div>
                {!addLocation && (addDeviceLatitude || addDeviceLongitude) && (
                  <p className="mt-1 text-xs text-rose-600">Invalid coordinates. Latitude: -90..90, Longitude: -180..180.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                onClick={onCloseAddPopup}
                variant="secondary"
                disabled={isSubmittingDeviceAction}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onAddDevice}
                disabled={!canSubmitAddDevice}
              >
                {isSubmittingDeviceAction ? 'Adding...' : 'Add Device'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Update Avatar</h3>

            <div className="relative mt-4 h-72 w-full overflow-hidden rounded-lg bg-slate-100">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={onSetCrop}
                onZoomChange={onSetZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-semibold text-slate-700">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => onSetZoom(Number(event.target.value))}
                className="w-full"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSetImageSrc(null)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveCroppedImage}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                disabled={isUploading}
              >
                {isUploading ? 'Updating...' : 'Save Avatar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
