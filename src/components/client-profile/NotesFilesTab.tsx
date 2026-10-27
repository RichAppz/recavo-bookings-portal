import { FileAttachments } from "@/components/FileAttachments";
import { NoteQuickAdd, NotesList, useTeamMemberName } from "@/components/client-profile/Notes";
import { ProfileCard } from "@/components/client-profile/parts";
import type { CustomerNote } from "@/lib/api/types";

export function NotesFilesTab({
  customerId,
  notes,
  timezone,
  canUpload,
}: {
  customerId: string;
  notes: readonly CustomerNote[];
  timezone: string;
  canUpload: boolean;
}) {
  const memberName = useTeamMemberName();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[1000px]:grid-cols-2">
      <ProfileCard title="Notes" note="Only your team sees these">
        <div className="px-4 pb-3">
          <NoteQuickAdd customerId={customerId} />
        </div>
        <NotesList
          notes={notes}
          timezone={timezone}
          emptyText="No notes yet. Notes help the whole team look after this client the same way."
        />
      </ProfileCard>
      <ProfileCard title="Files" note={canUpload ? "Upload file · up to 25 MB" : undefined}>
        <div className="px-4 pb-4">
          <FileAttachments
            ownerType="customer"
            ownerId={customerId}
            canUpload={canUpload}
            listExisting
            hideHeader
            uploaderName={memberName}
            title="Files"
            description="Photos, waivers and other documents held against this client."
          />
        </div>
      </ProfileCard>
    </div>
  );
}
